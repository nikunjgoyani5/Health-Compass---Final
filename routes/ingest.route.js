import { Router } from "express";
import { supplementStatusHook, driveHook, trelloHook } from "../controllers/ingest.controller.js";
const r = Router();
r.post("/ecs/supplements/status", supplementStatusHook); // Romil calls this
r.post("/drive/hook", driveHook);
r.post("/trello/hook", trelloHook);
export default r;
