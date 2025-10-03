import OpsSummary from "../models/OpsSummary.model.js";
import AwsLog from "../models/AwsLog.model.js";
import { apiOk, apiBad } from "../utils/awsapiResponse.js";
import { 
  getEcsServiceSummary, 
  getPipelineCountsFromLogs, 
  getGovernanceStatus, 
  getFailoverStatus 
} from "../services/awsReadService.js";

export const getDashboardV1 = async (req, res) => {
  try {
    // Get real-time AWS data
    const [ecsData, pipelineData, governanceData, failoverData] = await Promise.all([
      getEcsServiceSummary(),
      getPipelineCountsFromLogs(),
      getGovernanceStatus(),
      getFailoverStatus()
    ]);

    // Get latest OpsSummary from database
    const doc = await OpsSummary.findOne({}, {}, { sort: { updatedAt: -1 } });
    
    // Create comprehensive dashboard data
    const dashboardData = {
      timestamp: new Date().toISOString(),
      orchestration: {
        status: pipelineData.errors > 0 ? "DEGRADED" : "LIVE",
        lastUpdate: pipelineData.lastRun,
        services: ecsData
      },
      pipeline: {
        name: "Ingest Pipeline",
        last_run: {
          status: pipelineData.errors > 0 ? "failed" : "successful",
          timestamp: pipelineData.lastRun,
          relative_time: getRelativeTime(pipelineData.lastRun)
        },
        errors_today: {
          count: pipelineData.errors,
          review_needed: pipelineData.errors > 0
        },
        timeline: await getPipelineTimeline(pipelineData),
        summary: {
          successful_runs: pipelineData.success,
          warnings: pipelineData.warnings
        }
      },
      governance: {
        driftSentinel: governanceData.driftSentinel,
        reflectionAnchors: governanceData.reflectionAnchors,
        overridePending: governanceData.overridePending,
        complianceScore: calculateComplianceScore(governanceData)
      },
      failover: {
        aws: failoverData.aws,
        digitalOcean: failoverData.digitalOcean,
        readyToFailover: failoverData.readyToFailover,
        lastHealthCheck: new Date().toISOString()
      },
      metrics: {
        totalRequests: await getTotalRequests(),
        errorRate: calculateErrorRate(pipelineData),
        uptime: await calculateUptime(),
        costEstimate: await getCostEstimate()
      },
      alerts: await getActiveAlerts(pipelineData, governanceData, failoverData)
    };

    // Update database with latest data
    await OpsSummary.findOneAndUpdate({}, dashboardData, { upsert: true });

    return apiOk(res, dashboardData, "Dashboard data retrieved successfully");
  } catch (error) {
    console.error('Dashboard Error:', error);
    
    // Return fallback data on error
    const fallback = {
      timestamp: new Date().toISOString(),
      orchestration: { status: "ERROR", lastUpdate: null, services: { error: error.message } },
      pipeline: { 
        name: "Ingest Pipeline",
        last_run: { status: "failed", timestamp: null, relative_time: "unknown" },
        errors_today: { count: 1, review_needed: true },
        timeline: [],
        summary: { successful_runs: 0, warnings: 0 }
      },
      governance: { driftSentinel: false, reflectionAnchors: false, overridePending: false, complianceScore: 0 },
      failover: { aws: "UNKNOWN", digitalOcean: "UNKNOWN", readyToFailover: false, lastHealthCheck: null },
      metrics: { totalRequests: 0, errorRate: 100, uptime: 0, costEstimate: 0 },
      alerts: [{ type: "ERROR", message: "Failed to fetch dashboard data", severity: "HIGH" }]
    };
    
    return apiBad(res, "Failed to fetch dashboard data", 500, fallback);
  }
};

// Helper functions
const calculateHealthScore = (pipelineData) => {
  const total = pipelineData.success + pipelineData.warnings + pipelineData.errors;
  if (total === 0) return 100;
  return Math.round((pipelineData.success / total) * 100);
};

const calculateComplianceScore = (governanceData) => {
  let score = 0;
  if (governanceData.driftSentinel) score += 40;
  if (governanceData.reflectionAnchors) score += 40;
  if (!governanceData.overridePending) score += 20;
  return score;
};

const calculateErrorRate = (pipelineData) => {
  const total = pipelineData.success + pipelineData.warnings + pipelineData.errors;
  if (total === 0) return 0;
  return Math.round((pipelineData.errors / total) * 100);
};

const getTotalRequests = async () => {
  try {
    const logs = await AwsLog.find({ source: 'CloudWatch' }).sort({ createdAt: -1 }).limit(100);
    return logs.reduce((sum, log) => sum + (log.data.totalRequests || 0), 0);
  } catch (error) {
    return 0;
  }
};

const calculateUptime = async () => {
  try {
    const logs = await AwsLog.find({ source: 'ECS' }).sort({ createdAt: -1 }).limit(24);
    const uptimeLogs = logs.filter(log => log.data.running > 0);
    return Math.round((uptimeLogs.length / logs.length) * 100) || 0;
  } catch (error) {
    return 0;
  }
};

const getCostEstimate = async () => {
  try {
    // This would typically integrate with AWS Cost Explorer API
    // For now, return a mock calculation
    const logs = await AwsLog.find({ source: 'ECS' }).sort({ createdAt: -1 }).limit(1);
    const runningServices = logs[0]?.data?.running || 0;
    return runningServices * 0.05; // $0.05 per running service per hour
  } catch (error) {
    return 0;
  }
};

const getActiveAlerts = async (pipelineData, governanceData, failoverData) => {
  const alerts = [];
  
  if (pipelineData.errors > 5) {
    alerts.push({
      type: "PIPELINE_ERROR",
      message: `High error rate detected: ${pipelineData.errors} errors`,
      severity: "HIGH",
      timestamp: new Date().toISOString()
    });
  }
  
  if (!governanceData.driftSentinel) {
    alerts.push({
      type: "GOVERNANCE",
      message: "Drift Sentinel is not active",
      severity: "MEDIUM",
      timestamp: new Date().toISOString()
    });
  }
  
  if (failoverData.readyToFailover) {
    alerts.push({
      type: "FAILOVER",
      message: "System ready for failover to DigitalOcean",
      severity: "HIGH",
      timestamp: new Date().toISOString()
    });
  }
  
  return alerts;
};

// Helper function to get relative time
const getRelativeTime = (timestamp) => {
  if (!timestamp) return "unknown";
  
  const now = new Date();
  const time = new Date(timestamp);
  const diffInMinutes = Math.floor((now - time) / (1000 * 60));
  
  if (diffInMinutes < 1) return "just now";
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
};

// Helper function to get pipeline timeline
const getPipelineTimeline = async (currentPipelineData) => {
  try {
    // Get pipeline runs from the last 6 hours - try multiple sources
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    
    // Try to find logs from various sources that might contain pipeline data
    const logs = await AwsLog.find({ 
      $or: [
        { source: 'Pipeline' },
        { source: 'ECS' },
        { source: 'CloudWatch' },
        { source: { $regex: /pipeline/i } },
        { source: { $regex: /ingest/i } }
      ],
      createdAt: { $gte: sixHoursAgo }
    }).sort({ createdAt: -1 }).limit(20);
    
    console.log('Found logs for timeline:', logs.length);
    
    const timeline = [];
    const now = new Date();
    
    // Create timeline for last 6 hours
    for (let i = 6; i >= 0; i--) {
      const timePoint = new Date(now.getTime() - i * 60 * 60 * 1000);
      const timeLabel = i === 0 ? "now" : `${i}h`;
      
      // Find the closest log entry for this time period
      const closestLog = logs.find(log => {
        const logTime = new Date(log.createdAt);
        const timeDiff = Math.abs(logTime - timePoint);
        return timeDiff < 60 * 60 * 1000; // Within 1 hour
      });
      
      let status = "no_data";
      if (closestLog) {
        // Check for errors in various data structures
        const hasErrors = closestLog.data?.errors > 0 || 
                         closestLog.data?.errorCount > 0 || 
                         closestLog.data?.failed > 0 ||
                         closestLog.data?.status === 'failed' ||
                         closestLog.data?.status === 'error';
        
        status = hasErrors ? "failed" : "successful";
      } else if (i === 0) {
        // For "now" time, use current pipeline status if no log found
        if (currentPipelineData && currentPipelineData.errors > 0) {
          status = "failed";
        } else if (currentPipelineData && currentPipelineData.success > 0) {
          status = "successful";
        }
      }
      
      timeline.push({
        time: timeLabel,
        status: status
      });
    }
    
    return timeline;
  } catch (error) {
    console.error('Timeline Error:', error);
    // Return empty timeline on error - no static data
    return [
      { time: "6h", status: "no_data" },
      { time: "5h", status: "no_data" },
      { time: "4h", status: "no_data" },
      { time: "3h", status: "no_data" },
      { time: "2h", status: "no_data" },
      { time: "1h", status: "no_data" },
      { time: "now", status: "no_data" }
    ];
  }
};
