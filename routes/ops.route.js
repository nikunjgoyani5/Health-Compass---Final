import { Router } from "express";
import { listFailures, resolveFailure, listQuarantine } from "../controllers/ops.controller.js";
const r = Router();
r.get("/failures", listFailures);
r.post("/failures/resolve", resolveFailure);
r.get("/quarantine", listQuarantine);
export default r;
