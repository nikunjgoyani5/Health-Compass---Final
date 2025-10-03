import { apiOk } from "../utils/awsapiResponse.js";
import FailureLog from "../models/FailureLog.model.js";
import OpsSummary from "../models/OpsSummary.model.js";

// Hook: Supplement ECS pipeline callback (status + counts)
export const supplementStatusHook = async (req,res)=>{
  // expected payload from Romil:
  // { taskId, runId, lastRun, counts: { success, warnings, errors }, meta: {...} }
  const { taskId, runId, lastRun, counts, meta } = req.body || {};
  await OpsSummary.findOneAndUpdate({}, {
    $set: {
      "pipeline.lastRun": lastRun ? new Date(lastRun) : new Date(),
      "pipeline.success": counts?.success ?? 0,
      "pipeline.warnings": counts?.warnings ?? 0,
      "pipeline.errors": counts?.errors ?? 0
    }
  }, { upsert:true, new:true });
  // If errors > 0, log a failure event
  if ((counts?.errors ?? 0) > 0) {
    await FailureLog.create({
      taskId, attempt: meta?.attempt || 1, failureType:"ingest",
      resolutionPath:"Check ECS logs; requeue failed items",
      outcome:"unresolved", source:"pipeline", metadata: meta || {}
    });
  }
  return apiResponse(res, { accepted:true });
};

// Hooks for Drive / Trello ingestion (just accept and store via FailureLog/AwsLog as needed)
export const driveHook = async (req,res)=> apiOk(res, { accepted:true });
export const trelloHook = async (req,res)=> apiOk(res, { accepted:true });
