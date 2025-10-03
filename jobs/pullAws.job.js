import cron from "node-cron";
import OpsSummary from "../models/OpsSummary.model.js";
import { getEcsServiceSummary, getPipelineCountsFromLogs, getGovernanceStatus, getFailoverStatus } from "../services/awsReadService.js";

export const startAwsPullJob = ()=>{
  cron.schedule("*/5 * * * *", async ()=>{
    const [pipe, gov, fail] = await Promise.all([
      getPipelineCountsFromLogs(),
      getGovernanceStatus(),
      getFailoverStatus()
    ]);
    const orchestration = { status: (pipe.errors>0) ? "DEGRADED" : "LIVE" };
    await OpsSummary.findOneAndUpdate({}, {
      orchestration,
      pipeline: {
        lastRun: pipe.lastRun,
        success: pipe.success,
        warnings: pipe.warnings,
        errors: pipe.errors
      },
      governance: gov,
      failover: fail
    }, { upsert:true });
  });
};
