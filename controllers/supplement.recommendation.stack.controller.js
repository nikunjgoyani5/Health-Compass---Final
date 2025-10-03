import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import RecommendationLogModel from "../models/recommendation-log.model.js";
// import SupplementModel from "../models/supplements.model.js";
import SupplementRecommendationStack from "../models/supplement.recommendation.stack.model.js";
import { UserRecommendation } from "../models/user.supplement.recommendation.model.js";
import Disclaimer from "../models/disclaimer.model.js";

const addToStack = async (req, res) => {
  try {
    const { userId, supplementRecommendationId } = req.body || {};

    const supp = await UserRecommendation.findById(
      supplementRecommendationId
    ).lean();

    if (!supp)
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Supplement not found",
        data: null,
      });

    // Check if supplement is already in stack
    const existingStack = await SupplementRecommendationStack.findOne({
      userId,
      "items.supplementRecommendationId": supplementRecommendationId,
    });

    if (existingStack) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.CONFLICT,
        message: "This is already added to your stack.",
        data: null,
      });
    }

    const stack = await SupplementRecommendationStack.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId },
        $addToSet: {
          items: {
            supplementRecommendationId,
            recommendationSnapshot: supp, // ✅ full snapshot of recommendation
          },
        },
      },
      { upsert: true, new: true }
    );

    await RecommendationLogModel.create({
      userId,
      supplementId: supp.supplementId, // ✅ actual supplement id (not recommendationId)
      action: "added",
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message:
        "Your stack has been successfully added! From now on, we’ll recommend supplements that best match your needs.",
      data: null,
    });
  } catch (e) {
    console.error(e);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

const getStack = async (req, res) => {
  try {
    const find = await SupplementRecommendationStack.find({
      userId: req.user._id,
    }).select("items");

    // ---------- Fetch Supplement Recommendation Disclaimer ----------
    const supplementRecommendationDisclaimer = await Disclaimer.getByType(
      "supplement_recommendation_disclaimer"
    );

    // Transforming the response
    const transformed = (find[0]?.items || []).map((item) => {
      return {
        _id: item.supplementRecommendationId,
        userId: req.user._id,
        supplementId: item.recommendationSnapshot.supplementId,
        ...item.recommendationSnapshot,
        disclaimer:
          supplementRecommendationDisclaimer &&
          supplementRecommendationDisclaimer.isActive === true
            ? {
                id: supplementRecommendationDisclaimer._id,
                type: supplementRecommendationDisclaimer.type,
                title: supplementRecommendationDisclaimer.title,
                content: supplementRecommendationDisclaimer.content,
                isActive: supplementRecommendationDisclaimer.isActive,
              }
            : null,
      };
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Recommendation stacks fetched successfully.",
      data: transformed,
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

const removeFromStack = async (req, res) => {
  try {
    const { userId, supplementRecommendationId } = req.body || {};

    if (!userId || !supplementRecommendationId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "userId and supplementRecommendationId are required",
        data: null,
      });
    }

    const stack = await SupplementRecommendationStack.findOneAndUpdate(
      { userId },
      {
        $pull: {
          items: { supplementRecommendationId },
        },
      },
      { new: true }
    );

    if (!stack) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Stack not found",
        data: null,
      });
    }

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Recommendation removed from stack successfully.",
      data: null,
    });
  } catch (e) {
    console.error(e);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

export default {
  addToStack,
  getStack,
  removeFromStack,
};
