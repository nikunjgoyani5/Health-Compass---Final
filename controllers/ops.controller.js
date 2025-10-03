import FailureLog from "../models/FailureLog.model.js";
import Quarantine from "../models/Quarantine.model.js";
import { apiOk, apiCreated, apiBad } from "../utils/awsapiResponse.js";

export const listFailures = async (req,res) => {
  const { type, since } = req.query;
  const q = {};
  if (type) q.failureType = type;
  if (since) q.createdAt = { $gte: new Date(since) };
  const items = await FailureLog.find(q).sort({ createdAt:-1 }).limit(200);
  return apiOk(res, items);
};

export const resolveFailure = async (req,res) => {
  const { id, outcome="resolved", resolutionPath="" } = req.body || {};
  if (!id) return apiBad(res, "id required");
  const updated = await FailureLog.findByIdAndUpdate(id, { outcome, resolutionPath }, { new:true });
  return apiOk(res, updated);
};

export const listQuarantine = async (req,res) => {
  const items = await Quarantine.find({}).sort({ createdAt:-1 }).limit(200);
  return apiOk(res, items);
};
