import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import { hasActiveSubscription } from "../utils/stripe.helper.js";
import UserModel from "../models/user.model.js";

/**
 * Middleware to protect premium routes via Stripe subscription
 */
export const verifyStripeSubscriptionAccess = async (req, res, next) => {
  try {
    const user = await UserModel.findOne({
      _id: req.user._id,
      is_deleted: false,
      is_active: true,
      is_verified: true,
      isBlocked: false,
    });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "User not found",
      });
    }

    if (!user.stripeCustomerId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You must have an active subscription to access this feature.",
      });
    }

    const hasAccess = await hasActiveSubscription(user.stripeCustomerId);

    if (!hasAccess) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You must have an active subscription to access this feature.",
      });
    }
    console.log({ hasAccess });

    // Attach Stripe customer to req for future use
    req.stripeCustomerId = user.stripeCustomerId;
    req.stripeCustomer = hasAccess;
    next();
  } catch (err) {
    console.error("Stripe verification error:", err);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Stripe verification failed",
    });
  }
};
