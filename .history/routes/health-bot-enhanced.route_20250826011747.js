/**
 *  Enhanced Health Bot Routes with Python Bridge Integration
 * 
 * This route file now only contains the essential endpoints for the Python bridge integration.
 */

import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import { routeAccessControl } from "../middleware/access.control.middleware.js";
import { chatWithEnhancedHealthBot } from "../controllers/health-bot-enhanced.controller.js";
import validation from "../validations/health-bot.validation.js";
import validate from "../middleware/validate.middleware.js";
import requireFeatures from "../middleware/features.middleware.js";

const route = express.Router();

// Enhanced Chat Endpoint (replaces original)
route.post(
  "/chat-enhanced",
  //verifyToken,
  routeAccessControl("public"),
  requireFeatures("mailchimp_enabled"),
  validate(validation.chatWithHealthBot),
  chatWithEnhancedHealthBot
);



// Backward Compatibility - Keep original endpoint
route.post(
  "/chat",
  //verifyToken,
  routeAccessControl("public"),
  requireFeatures("mailchimp_enabled"),
  validate(validation.chatWithHealthBot),
  chatWithEnhancedHealthBot // Use enhanced controller for backward compatibility
);

export default route;
