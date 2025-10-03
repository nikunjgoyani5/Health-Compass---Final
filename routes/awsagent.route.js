import { Router } from "express";
import { 
  acceptRecommendation, 
  addSelfDiagnosisNote, 
  getSelfDiagnosisHistory, 
  getAgentMetrics 
} from "../controllers/awsagent.controller.js";
import { lockAndValidate } from "../middleware/schemaLock.middleware.js";
import { RecommendationCardSchema } from "../controllers/agent.controller.js";

const r = Router();

// Recommendation endpoints
r.post(
  "/output/recommendation",
  lockAndValidate(RecommendationCardSchema, { schemaType:"recommendation_card", schemaVersion:"1.0.0" }),
  acceptRecommendation
);

// Self diagnosis endpoints
r.post("/self-diagnosis", addSelfDiagnosisNote);
r.get("/self-diagnosis/history", getSelfDiagnosisHistory);

// Agent metrics and analytics
r.get("/metrics", getAgentMetrics);

export default r;
