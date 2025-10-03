import express from "express";
import recommendationController from "../controllers/recommendation.controller.js";
import { recommendationValidation } from "../validations/recommendation.validation.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
// import { verifyStripeSubscriptionAccess } from "../middleware/verifyStripeAccess.middleware.js";
import validate from "../middleware/validate.middleware.js";
import rateLimiter from "../middleware/rateLimiter.js";
import { routeAccessControl } from "../middleware/access.control.middleware.js";
import enumConfig from "../config/enum.config.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";

const route = express.Router();

// GET /api/v1/recommendations/supplements - Get supplements with pagination and search
route.get(
  "/supplements",
  rateLimiter,
  verifyToken,
  // verifyStripeSubscriptionAccess,
  // routeAccessControl([enumConfig.accessControllerEnum.premium]),
  recommendationController.getNext
);

route.post(
  "/:userRecoId/refresh",
  rateLimiter,
  verifyToken,
  // verifyStripeSubscriptionAccess,
  // routeAccessControl([enumConfig.accessControllerEnum.premium]),
  recommendationController.refresh
);

route.get(
  "/list",
  rateLimiter,
  verifyToken,
  // verifyStripeSubscriptionAccess,
  // routeAccessControl([enumConfig.accessControllerEnum.premium]),
  recommendationController.listRecommendations
);

export default route;
