import { z } from "zod";
import Quarantine from "../models/Quarantine.model.js";
import FailureLog from "../models/FailureLog.model.js";

/**
 * lockAndValidate(schema, opts)
 * - schema: zod schema instance
 * - opts: { schemaType, schemaVersion, taskId }
 */
export const lockAndValidate = (schema, opts) => async (req, res, next) => {
  try {
    const parsed = schema.parse(req.body);   // strict validation
    // attach schema metadata for downstream
    req.validated = { ...parsed, _schemaType: opts.schemaType, _schemaVersion: opts.schemaVersion };
    return next();
  } catch (err) {
    // auto-quarantine
    await Quarantine.create({
      reason: "schema_mismatch",
      schemaType: opts.schemaType,
      schemaVersion: opts.schemaVersion,
      payload: req.body,
      linkedTaskId: opts.taskId || req.body?.taskId
    });
    await FailureLog.create({
      taskId: opts.taskId || req.body?.taskId,
      attempt: Number(req.body?.attempt || 1),
      failureType: "response",
      resolutionPath: "Auto-quarantined; review schema or agent prompt",
      outcome: "unresolved",
      source: "agent",
      metadata: { zodError: err.errors }
    });
    return res.status(422).json({ success:false, message:"Agent output quarantined (schema mismatch)" });
  }
};
