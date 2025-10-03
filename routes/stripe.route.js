import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/stripe.controller.js";
import { apiResponse } from "../helper/api-response.helper.js";
import { StatusCodes } from "http-status-codes";
import { verifyStripeSubscriptionAccess } from "../middleware/verifyStripeAccess.middleware.js";
import requireFeatures from "../middleware/features.middleware.js";

const router = express.Router();

router.post(
  "/create-checkout-session",
  verifyToken,
  // requireFeatures("paywall_enabled"),
  controller.createCheckoutSession
);

router.get(
  "/session/:sessionId",
  verifyToken,
  // requireFeatures("paywall_enabled"),
  controller.getCheckoutSessionDetails
);

router.get(
  "/subscription/:subscriptionId",
  verifyToken,
  // requireFeatures("paywall_enabled"),
  controller.getSubscription
);

router.post(
  "/cancel-subscription",
  verifyToken,
  // requireFeatures("paywall_enabled"),
  controller.cancelSubscription
);

router.post(
  "/re-activate-subscription",
  verifyToken,
  // requireFeatures("paywall_enabled"),
  controller.reactivateSubscription
);

router.patch(
  "/update-subscription",
  verifyToken,
  // requireFeatures("paywall_enabled"),
  controller.updateSubscriptionPlan
);

router.get(
  "/test-premium-access",
  verifyToken,
  // requireFeatures("paywall_enabled"),
  verifyStripeSubscriptionAccess,
  (req, res) => {
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "✅ Access granted to premium feature.",
      body: {
        stripeCustomerId: req.stripeCustomerId,
        isActive: req.stripeCustomer,
      },
    });
  }
);

router.get(
  "/payments/checkout-status",
  // requireFeatures("paywall_enabled"),
  controller.getCheckoutStatus
);

export default router;
