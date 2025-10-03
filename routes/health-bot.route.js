import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/health-bot.controller.js";
import validation from "../validations/health-bot.validation.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

route.post(
  "/chat",
  verifyToken,
  validate(validation.chatWithHealthBot),
  controller.chatWithHealthBot
);

// Test endpoint for safety patterns
route.get(
  "/test-safety",
  controller.testSafetyEndpoint
);

// Clear user cache endpoint
route.post(
  "/clear-cache",
  verifyToken,
  validate(validation.clearUserCache),
  controller.clearUserCache
);

export default route;
