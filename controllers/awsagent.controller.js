import { apiOk, apiBad } from "../utils/awsapiResponse.js";
import SelfDiagnosis from "../models/SelfDiagnosis.model.js";
import AwsLog from "../models/AwsLog.model.js";
import { chooseModel } from "../services/llmRouter.service.js";

// Validate + accept agent output (auto-quarantine happens in middleware on failure)
export const acceptRecommendation = async (req, res) => {
  try {
  // req.validated comes from middleware if schema passed
    const recommendation = req.validated;
    
    // Log the recommendation acceptance
    await AwsLog.create({
      source: 'Agent',
      data: {
        action: 'recommendation_accepted',
        taskId: recommendation.taskId,
        runId: recommendation.runId,
        recommendationType: recommendation.type,
        confidence: recommendation.confidence,
        timestamp: new Date()
      }
    });

    // Process recommendation based on type
    const processedRecommendation = await processRecommendation(recommendation);
    
    return apiOk(res, { 
      saved: true, 
      data: processedRecommendation,
      message: "Recommendation accepted and processed successfully."
    });
  } catch (error) {
    console.error('Accept Recommendation Error:', error);
    return apiBad(res, "Failed to process recommendation", 500, { error: error.message });
  }
};

// Save reflectionAnchors notes
export const addSelfDiagnosisNote = async (req, res) => {
  try {
    const { taskId, runId, checkpoint, notes, score = 0, tags = [] } = req.body || {};
    
    // Validate required fields
    if (!taskId || !runId || !checkpoint || !notes) {
      return apiBad(res, "Missing required fields: taskId, runId, checkpoint, notes");
    }

    // Create self diagnosis note
    const doc = await SelfDiagnosis.create({ 
      taskId, 
      runId, 
      checkpoint, 
      notes, 
      score, 
      tags 
    });

    // Log the self diagnosis
    await AwsLog.create({
      source: 'Agent',
      data: {
        action: 'self_diagnosis_added',
        taskId,
        runId,
        checkpoint,
        score,
        tags,
        timestamp: new Date()
      }
    });

    // Analyze the diagnosis for insights
    const insights = await analyzeSelfDiagnosis(doc);

    return apiOk(res, { 
      ...doc.toObject(), 
      insights 
    }, "Self diagnosis note added successfully");
  } catch (error) {
    console.error('Add Self Diagnosis Error:', error);
    return apiBad(res, "Failed to add self diagnosis note", 500, { error: error.message });
  }
};

// Get self diagnosis history
export const getSelfDiagnosisHistory = async (req, res) => {
  try {
    const { taskId, runId, limit = 50 } = req.query;
    
    const query = {};
    if (taskId) query.taskId = taskId;
    if (runId) query.runId = runId;

    const history = await SelfDiagnosis.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Get aggregated insights
    const insights = await getDiagnosisInsights(history);

    return apiOk(res, { 
      history, 
      insights,
      total: history.length 
    });
  } catch (error) {
    console.error('Get Self Diagnosis History Error:', error);
    return apiBad(res, "Failed to retrieve diagnosis history", 500, { error: error.message });
  }
};

// Get agent performance metrics
export const getAgentMetrics = async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    const timeFilter = getTimeFilter(timeRange);
    
    // Get metrics from logs
    const logs = await AwsLog.find({
      source: 'Agent',
      createdAt: timeFilter
    }).sort({ createdAt: -1 });

    const metrics = {
      totalRecommendations: logs.filter(log => log.data.action === 'recommendation_accepted').length,
      totalDiagnoses: logs.filter(log => log.data.action === 'self_diagnosis_added').length,
      averageConfidence: calculateAverageConfidence(logs),
      topCheckpoints: getTopCheckpoints(logs),
      performanceScore: calculatePerformanceScore(logs),
      timeRange
    };

    return apiOk(res, metrics);
  } catch (error) {
    console.error('Get Agent Metrics Error:', error);
    return apiBad(res, "Failed to retrieve agent metrics", 500, { error: error.message });
  }
};

// Helper functions
const processRecommendation = async (recommendation) => {
  // Add processing logic based on recommendation type
  const processed = {
    ...recommendation,
    processedAt: new Date(),
    status: 'processed',
    priority: calculatePriority(recommendation),
    estimatedImpact: calculateImpact(recommendation)
  };

  // If it's a health recommendation, add additional processing
  if (recommendation.type === 'health') {
    processed.healthScore = await calculateHealthScore(recommendation);
    processed.riskLevel = assessRiskLevel(processed.healthScore);
  }

  return processed;
};

const analyzeSelfDiagnosis = async (diagnosis) => {
  // Use LLM to analyze the diagnosis
  const model = chooseModel({ 
    taskKind: 'analysis', 
    complexity: 'medium' 
  });

  // This would typically call an LLM service
  // For now, return basic analysis
  return {
    sentiment: diagnosis.score > 7 ? 'positive' : diagnosis.score < 4 ? 'negative' : 'neutral',
    urgency: diagnosis.score > 8 ? 'high' : diagnosis.score < 3 ? 'low' : 'medium',
    suggestedActions: generateSuggestedActions(diagnosis),
    confidence: diagnosis.score / 10
  };
};

const getDiagnosisInsights = async (history) => {
  if (history.length === 0) return {};

  const avgScore = history.reduce((sum, h) => sum + h.score, 0) / history.length;
  const checkpoints = [...new Set(history.map(h => h.checkpoint))];
  const commonTags = getCommonTags(history);

  return {
    averageScore: Math.round(avgScore * 10) / 10,
    totalDiagnoses: history.length,
    checkpoints,
    commonTags,
    trend: calculateTrend(history)
  };
};

const calculateAverageConfidence = (logs) => {
  const confidenceLogs = logs.filter(log => log.data.confidence);
  if (confidenceLogs.length === 0) return 0;
  
  const total = confidenceLogs.reduce((sum, log) => sum + log.data.confidence, 0);
  return Math.round((total / confidenceLogs.length) * 100) / 100;
};

const getTopCheckpoints = (logs) => {
  const checkpointCounts = {};
  logs.forEach(log => {
    if (log.data.checkpoint) {
      checkpointCounts[log.data.checkpoint] = (checkpointCounts[log.data.checkpoint] || 0) + 1;
    }
  });
  
  return Object.entries(checkpointCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([checkpoint, count]) => ({ checkpoint, count }));
};

const calculatePerformanceScore = (logs) => {
  const totalLogs = logs.length;
  if (totalLogs === 0) return 0;
  
  const successfulLogs = logs.filter(log => 
    log.data.action === 'recommendation_accepted' || 
    log.data.action === 'self_diagnosis_added'
  ).length;
  
  return Math.round((successfulLogs / totalLogs) * 100);
};

const getTimeFilter = (timeRange) => {
  const now = new Date();
  switch (timeRange) {
    case '1h': return { $gte: new Date(now.getTime() - 60 * 60 * 1000) };
    case '24h': return { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    case '7d': return { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    case '30d': return { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    default: return { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
  }
};

const calculatePriority = (recommendation) => {
  if (recommendation.confidence > 0.8) return 'high';
  if (recommendation.confidence > 0.5) return 'medium';
  return 'low';
};

const calculateImpact = (recommendation) => {
  // Simple impact calculation based on confidence and type
  const baseImpact = recommendation.confidence * 100;
  const typeMultiplier = recommendation.type === 'health' ? 1.5 : 1.0;
  return Math.round(baseImpact * typeMultiplier);
};

const calculateHealthScore = async (recommendation) => {
  // Mock health score calculation
  return Math.round(Math.random() * 100);
};

const assessRiskLevel = (healthScore) => {
  if (healthScore > 80) return 'low';
  if (healthScore > 50) return 'medium';
  return 'high';
};

const generateSuggestedActions = (diagnosis) => {
  const actions = [];
  if (diagnosis.score < 5) actions.push('Schedule follow-up consultation');
  if (diagnosis.tags.includes('chronic')) actions.push('Monitor long-term trends');
  if (diagnosis.score > 7) actions.push('Continue current treatment plan');
  return actions;
};

const getCommonTags = (history) => {
  const tagCounts = {};
  history.forEach(h => {
    h.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  
  return Object.entries(tagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));
};

const calculateTrend = (history) => {
  if (history.length < 2) return 'stable';
  
  const recent = history.slice(0, Math.floor(history.length / 2));
  const older = history.slice(Math.floor(history.length / 2));
  
  const recentAvg = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
  const olderAvg = older.reduce((sum, h) => sum + h.score, 0) / older.length;
  
  if (recentAvg > olderAvg + 1) return 'improving';
  if (recentAvg < olderAvg - 1) return 'declining';
  return 'stable';
};
