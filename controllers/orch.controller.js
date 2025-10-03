import FailureLog from "../models/FailureLog.model.js";
import { apiOk } from "../utils/awsapiResponse.js";

export const acceptFailureMeta = async (req,res)=>{
  // Orchestration posts: { taskId, attempt, failureType, resolutionPath, outcome, source, metadata }
  const doc = await FailureLog.create(req.body);
  return apiOk(res, doc);
};
