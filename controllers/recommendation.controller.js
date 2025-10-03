import { apiResponse } from "../helper/api-response.helper.js";
import { StatusCodes } from "http-status-codes";
import RecommendationLogModel from "../models/recommendation-log.model.js";
import {
  pickNextSuggestion,
  pickRecommendationList,
} from "../services/supplement-recommendation.service.js";
import { UserRecommendation } from "../models/user.supplement.recommendation.model.js";
import mongoose from "mongoose";
import SupplementRecommendationStack from "../models/supplement.recommendation.stack.model.js";
import Disclaimer from "../models/disclaimer.model.js";

// Get next recommendation (Only AI selected)
const getNext = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId)
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "userId is required",
        data: null,
      });

    const recentDislikes = await RecommendationLogModel.find({
      userId,
      action: "disliked",
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const excludeIds = recentDislikes.map((r) => r.supplementId);

    const suggestion = await pickNextSuggestion({ userId, excludeIds });
    if (!suggestion)
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "No suggestions available",
        data: null,
      });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Recommendation fetched",
      data: suggestion,
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

// Don't ask again - call this API and refresh recommendation (AI selected)
const refresh = async (req, res) => {
  try {
    const userRecoId = req.params?.userRecoId;
    const { userId, isDontLike = false, dislikedSupplementId } = req.body || {};

    if (!userId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "userId is required",
        data: null,
      });
    }

    const exclude = [];

    // If client sent a UserRecommendation id + isDontLike=true → delete it and log 'disliked'
    if (isDontLike && userRecoId && mongoose.isValidObjectId(userRecoId)) {
      const prev = await UserRecommendation.findOne({
        _id: userRecoId,
        userId,
      }).lean();
      if (prev) {
        exclude.push(prev.supplementId);
        await UserRecommendation.deleteOne({ _id: prev._id });
        await RecommendationLogModel.create({
          userId,
          supplementId: prev.supplementId,
          action: "disliked",
        });
      }
    }

    // Backward-compat: if a raw disliked supplement id was provided, respect it
    if (
      dislikedSupplementId &&
      mongoose.isValidObjectId(dislikedSupplementId)
    ) {
      exclude.push(new mongoose.Types.ObjectId(dislikedSupplementId));
      await RecommendationLogModel.create({
        userId,
        supplementId: dislikedSupplementId,
        action: "disliked",
      });
    }

    // Also exclude a few most recent 'suggested' so we don't repeat
    const lastSuggested = await RecommendationLogModel.find({
      userId,
      action: "suggested",
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    exclude.push(...lastSuggested.map((r) => r.supplementId));

    // Generate next suggestion
    const suggestion = await pickNextSuggestion({
      userId,
      excludeIds: exclude,
    });
    if (!suggestion) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "No new suggestions available",
        data: null,
      });
    }

    // Persist the newly suggested card in UserRecommendation collection
    const created = await UserRecommendation.create({
      userId,
      supplementId: suggestion.supplement._id,
      supplement: suggestion.supplement,
      recommendation_tag: suggestion.recommendation_tag,
      confidence_score: suggestion.confidence_score,
      confidence_label: suggestion.confidence_label,
      matched_goals: suggestion.matched_goals,
      ai_insight: suggestion.ai_insight,
      action: "suggested",
      shuffleKey: Math.random(),
    });

    // Log the suggestion in the log collection
    await RecommendationLogModel.create({
      userId,
      supplementId: suggestion.supplement._id,
      action: "suggested",
    });

    // Return the new suggestion, including its persisted id for future operations
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Recommendation refreshed",
      data: { _id: created._id, ...suggestion },
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

// Final recommendation list of supplement (Smart Suggestion + AI Selected)
const listRecommendations = async (req, res) => {
  try {
    const userId = req.query.userId;
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    const page = Math.max(Number(req.query.page || 1), 1);
    const generate = Math.min(
      Math.max(Number(req.query.generate || 50), 1),
      100
    );

    // keep your current refresh behavior
    const refresh = "true";

    if (!userId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "userId is required",
        data: null,
      });
    }

    // 🔒 0) Load locked recommendation IDs from the user's stack
    const stack = await SupplementRecommendationStack.findOne({ userId })
      .select("items.supplementRecommendationId")
      .lean();
    // ---------- Fetch Supplement Recommendation Disclaimer ----------
    const supplementRecommendationDisclaimer = await Disclaimer.getByType(
      "supplement_recommendation_disclaimer"
    );

    const filter = { userId };

    const lockedIdsArr = (stack?.items || [])
      .map((it) => it.supplementRecommendationId)
      .filter(Boolean);

    // Ensure proper ObjectId array
    const lockedIds =
      lockedIdsArr.length > 0
        ? lockedIdsArr.map((id) =>
            typeof id === "string" ? new mongoose.Types.ObjectId(id) : id
          )
        : [];

    // Base filter for list/read paths: exclude locked recs
    const baseFilter =
      lockedIds.length > 0 ? { userId, _id: { $nin: lockedIds } } : { userId };

    // FAST PATH (unchanged logic, but use baseFilter so locked items never show)
    if (!refresh) {
      const total = await UserRecommendation.countDocuments(baseFilter);
      if (total > 0) {
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const skip = (page - 1) * limit;
        const items = await UserRecommendation.find(baseFilter)
          .sort({ shuffleKey: 1, _id: 1 })
          .skip(skip)
          .limit(limit)
          .lean();

        // ---------- Add Disclaimer to each recommendation ----------
        const itemsWithDisclaimer = items.map((item) => ({
          ...item,
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
        }));

        return apiResponse({
          res,
          status: true,
          statusCode: StatusCodes.OK,
          message: "Recommendations fetched",
          pagination: { page, limit, total, totalPages },
          data: itemsWithDisclaimer,
        });
      }
    }

    // 1) recent dislikes -> exclusion list (unchanged)
    const recentDislikes = await RecommendationLogModel.find({
      userId,
      action: "disliked",
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const excludeIds = recentDislikes.map((r) => r.supplementId);

    // 2) Generate fresh list (unchanged call), you may ALSO exclude supplements used by locked recs if needed.
    const freshList = await pickRecommendationList({
      userId,
      limit: generate,
      excludeIds,
    });

    if (!freshList.length) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "No recommendations available",
        data: [],
      });
    }

    // 3) Replace existing persisted list for this user,
    //    BUT do NOT delete any recommendations that are locked in the stack 👇
    const deleteFilter =
      lockedIds.length > 0
        ? { userId, action: "list_suggested", _id: { $nin: lockedIds } }
        : { userId, action: "list_suggested" };

    // Parallel: Delete old recommendations + Prepare bulk insert
    const ops = freshList.map((item) => ({
      insertOne: {
        document: {
          userId,
          supplementId: item.supplement._id,
          supplement: item.supplement,
          recommendation_tag: item.recommendation_tag,
          confidence_score: item.confidence_score,
          confidence_label: item.confidence_label,
          matched_goals: item.matched_goals,
          ai_insight: item.ai_insight,
          reason: item.reason, // 👈 store reason
          action: "list_suggested",
          shuffleKey: Math.random(),
        },
      },
    }));

    // Parallel: Delete old + Bulk insert new recommendations
    await Promise.all([
      UserRecommendation.deleteMany(deleteFilter),
      UserRecommendation.bulkWrite(ops, { ordered: false }),
    ]);

    // 4) Read back in shuffled order with pagination,
    //    excluding locked items from list & counts 👇
    const total = await UserRecommendation.countDocuments(baseFilter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const skip = (page - 1) * limit;

    const items = await UserRecommendation.find(baseFilter)
      .sort({ shuffleKey: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ---------- Add Disclaimer to each recommendation ----------
    const itemsWithDisclaimer = items.map((item) => ({
      ...item,
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
    }));

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Recommendations fetched",
      pagination: { page, limit, totalItems: total, totalPages },
      data: itemsWithDisclaimer,
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
  getNext,
  refresh,
  listRecommendations,
};
