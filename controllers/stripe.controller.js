import Stripe from "stripe";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import UserModel from "../models/user.model.js";
import enums from "../config/enum.config.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const isValidUnix = (timestamp) => {
  return (
    typeof timestamp === "number" &&
    !isNaN(new Date(timestamp * 1000).getTime())
  );
};

const checkTrialUsed = async (customerId, priceId) => {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 10,
  });

  return subscriptions.data.some((sub) =>
    sub.items.data.some((item) => item.price.id === priceId)
  );
};

const createCheckoutSession = async (req, res) => {
  try {
    const {
      email,
      priceId,
      paymentSuccessUrl,
      paymentCancelUrl,
      subscriptionName,
    } = req.body;

    if (
      !email ||
      !priceId ||
      !paymentSuccessUrl ||
      !paymentCancelUrl ||
      !subscriptionName
    ) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Missing required fields",
      });
    }

    // ✅ Step 0: Fetch price from Stripe to get type
    const price = await stripe.prices.retrieve(priceId);
    const isRecurring = !!price.recurring;

    // ✅ Step 1: Find user
    const user = await UserModel.findOne({
      email,
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

    // ✅ Step 2: Create or reuse Stripe customer
    let customer;
    if (user.stripeCustomerId) {
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
    } else {
      customer = await stripe.customers.create({ email });
      user.stripeCustomerId = customer.id;
      user.stripeDetails = customer;
      await user.save();
    }

    // ✅ Step 3: Trial days if applicable
    let trialDays = 0;
    if (isRecurring) {
      const hasUsedTrial = await checkTrialUsed(customer.id, priceId); // implement yourself
      if (!hasUsedTrial) {
        if (subscriptionName === enums.subscriptionPlanEnum.WEEKLY) {
          trialDays = 3;
        } else if (subscriptionName === enums.subscriptionPlanEnum.YEARLY) {
          trialDays = 7;
        }
      }
    }

    // ✅ Step 4: Prepare session options
    const options = {
      mode: isRecurring ? "subscription" : "payment",
      customer: customer.id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${paymentSuccessUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: paymentCancelUrl,
      metadata: {
        userId: String(user._id),
        subscriptionName,
      },
    };

    if (isRecurring && trialDays > 0) {
      options.subscription_data = {
        trial_period_days: trialDays,
      };
    }

    // ✅ Step 5: Create checkout session
    const session = await stripe.checkout.sessions.create(options);

    // Partial save – full save should happen in webhook
    if (isRecurring) {
      user.stripeSubscriptionId = session.subscription || null;
      user.subscriptionPurchasedAt = new Date();
      user.isSubscribed = true;
      user.is_premium = true;
      await user.save();
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.CREATE_CHECKOUT_SESSION,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: activityDescriptions.STRIPE.CREATE_CHECKOUT_SESSION,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Checkout session created successfully.",
      data: {
        userId: user._id,
        email: user.email,
        sessionId: session.id,
        customerId: customer.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error("❌ Checkout error:", error.message);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.CREATE_CHECKOUT_SESSION,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description:
        error.message || "Failed to create checkout session from stripe.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: error.message || "Failed to create checkout session",
    });
  }
};

const getCheckoutSessionDetails = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.SESSION_DETAILS,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: activityDescriptions.STRIPE.SESSION_DETAILS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Checkout session details retrieved successfully",
      data: {
        sessionId: session.id,
        customerEmail: session.customer_details?.email,
        paymentStatus: session.payment_status,
        stripeSubscriptionId: session.subscription,
        customerId: session.customer,
      },
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.SESSION_DETAILS,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: error.message || "Failed to fetch checkout session details.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.NOT_FOUND,
      message: "Checkout session not found",
    });
  }
};

const getSubscription = async (req, res) => {
  const { subscriptionId } = req.params;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.GET_SUBSCRIPTION,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: activityDescriptions.STRIPE.GET_SUBSCRIPTION,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Subscription details retrieved successfully",
      data: subscription,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.GET_SUBSCRIPTION,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description:
        error.message || "Failed to fetch subscription details from stripe.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message:
        error.message || "Failed to fetch subscription details from stripe.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const cancelSubscription = async (req, res) => {
  const userId = req.user._id;
  const user = await UserModel.findById(userId);

  if (!user || !user.stripeSubscriptionId) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.NOT_FOUND,
      message: "User or subscription not found",
    });
  }

  try {
    // Retrieve the subscription from Stripe
    const stripeSub = await stripe.subscriptions.retrieve(
      user.stripeSubscriptionId
    );

    if (!stripeSub || stripeSub.status === "canceled") {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Subscription already canceled or not found",
      });
    }

    // Cancel at period end
    const canceledSub = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      }
    );

    // Update user record
    user.cancelAtPeriodEnd = true;
    user.subscriptionEndDate = isValidUnix(stripeSub.current_period_end)
      ? isValidUnix(new Date(stripeSub.current_period_end * 1000))
      : null;

    await user.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.CANCEL_SUB,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: activityDescriptions.STRIPE.CANCEL_SUB,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Subscription will be canceled at period end",
      data: {
        subscriptionId: canceledSub.id,
        status: canceledSub.status,
        cancelAtPeriodEnd: canceledSub.cancel_at_period_end,
      },
    });
  } catch (error) {
    console.error("❌ Error canceling subscription:", error.message);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.CANCEL_SUB,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description:
        error.message || "Failed to cancel subscription from stripe.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to cancel subscription",
    });
  }
};

const reactivateSubscription = async (req, res) => {
  const userId = req.user._id;
  const user = await UserModel.findById(userId);

  if (!user || !user.stripeSubscriptionId) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.NOT_FOUND,
      message: "User or subscription not found.",
    });
  }

  try {
    // 1. Retrieve current subscription from Stripe
    const stripeSub = await stripe.subscriptions.retrieve(
      user.stripeSubscriptionId
    );

    // 2. Check if already active (no need to reactivate)
    if (!stripeSub || stripeSub.status === "canceled") {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Subscription has already ended. Please purchase a new plan.",
      });
    }

    if (stripeSub.cancel_at_period_end === false) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Subscription is already active. No need to reactivate.",
      });
    }

    // 3. Reactivate the subscription
    const updatedSub = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    // 4. Update your DB
    user.cancelAtPeriodEnd = false;
    user.subscriptionEndDate = isValidUnix(updatedSub.current_period_end)
      ? new Date(updatedSub.current_period_end * 1000)
      : null;
    await user.save();

    // 5. Log activity
    await activityLogService.createActivity({
      userId,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.REACTIVATE_SUB,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: activityDescriptions.STRIPE.REACTIVATE_SUB,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    // 6. Send response
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Subscription reactivated successfully.",
      data: {
        subscriptionId: updatedSub.id,
        status: updatedSub.status,
        cancelAtPeriodEnd: updatedSub.cancel_at_period_end,
        currentPeriodEnd: new Date(updatedSub.current_period_end * 1000),
      },
    });
  } catch (error) {
    console.error("❌ Error reactivating subscription:", error.message);
    await activityLogService.createActivity({
      userId,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.REACTIVATE_SUB,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: error.message || "Failed to reactivate subscription.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to reactivate subscription. Please try again.",
    });
  }
};

const updateSubscriptionPlan = async (req, res) => {
  try {
    const user = req.user;
    const { priceId } = req.body;

    const subscriptionId = user.stripeSubscriptionId;

    if (!subscriptionId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Subscription not found",
      });
    }

    // Step 1: Get current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionItemId = subscription.items.data[0]?.id;

    if (!subscriptionItemId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Subscription item not found",
      });
    }

    // Step 2: Update subscription item to new price
    const updatedItem = await stripe.subscriptionItems.update(
      subscriptionItemId,
      {
        price: priceId,
        proration_behavior: "create_prorations", // or 'none', or 'always_invoice'
      }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.UPDATE_SUB,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: activityDescriptions.STRIPE.UPDATE_SUB,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Subscription plan updated successfully",
      data: updatedItem,
    });
  } catch (error) {
    console.error("❌ Subscription update error:", error.message);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.STRIPE.UPDATE_SUB,
      activityCategory: enumConfig.activityCategoryEnum.STRIPE,
      description: error.message || "Failed to update subscription plan.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return errorResponse({
      res,
      message: error.message,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const getCheckoutStatus = async (req, res) => {
  try {
    const user = await UserModel.findById(req.query.userId);

    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "User not found",
      });
    }

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Payment status fetched",
      data: {
        userId: user._id,
        email: user.email,
        paymentStatus: user.paymentStatus,
      },
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: error.message || "Failed to fetch payment status",
    });
  }
};

export default {
  createCheckoutSession,
  getCheckoutSessionDetails,
  getSubscription,
  cancelSubscription,
  updateSubscriptionPlan,
  reactivateSubscription,
  getCheckoutStatus,
};
