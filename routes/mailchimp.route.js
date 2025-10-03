import express from "express";
import mailchimpMiddleware from "../middleware/mailchimp.middleware.js";
import { subscribe, webhook } from "../controllers/mailchimp.controller.js";
import requireFeatures from "../middleware/features.middleware.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";

const route = express.Router();

// Subscribe endpoint (secured with basic token)
route.post(
  "/subscribe",
  verifyToken,
  // requireFeatures("mailchimp_enabled"),
  mailchimpMiddleware.checkBasicToken,
  mailchimpMiddleware.validateEmail,
  subscribe
);

// Webhook endpoint (secured with secret in query param)
route.post(
  "/webhook",
  mailchimpMiddleware.checkWebhookSecret,
  express.urlencoded({ extended: true }),
  webhook
);

export default route;
