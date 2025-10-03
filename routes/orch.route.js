import { Router } from "express";
import { acceptFailureMeta } from "../controllers/orch.controller.js";
const r = Router();
r.post("/failure", acceptFailureMeta);
export default r;
