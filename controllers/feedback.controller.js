import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import FeedbackModel from "../models/feedback.model.js";
import helper from "../helper/common.helper.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";
import UserModel from "../models/user.model.js";

const createFeedback = async (req, res) => {
  try {
    const data = req.body;
    data.createdBy = req.user._id;

    const result = await FeedbackModel.create(data);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.FEEDBACK.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.FEEDBACK,
      description: activityDescriptions.FEEDBACK.CREATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      data: result,
      message:
        "Your feedback has been submitted successfully. Thank you for your contribution.",
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.FEEDBACK.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.FEEDBACK,
      description: error.message || "Failed to submit feedback.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
      data: null,
    });
  }
};

const getFeedbacks = async (req, res) => {
  try {
    const filter = {};
    const { tag, fullName, fromDate, toDate } = req.query;

    // tag handling
    if (tag) {
      const tagArray = Array.isArray(tag)
        ? tag.map((t) => t.trim()).filter(Boolean)
        : tag
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
      if (tagArray.length) filter.tag = { $in: tagArray };
    }

    // date range handling
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) {
        const from = new Date(fromDate);
        if (isNaN(from.getTime())) {
          throw new Error("Invalid fromDate. Must be a valid UTC date string.");
        }
        filter.createdAt.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        if (isNaN(to.getTime())) {
          throw new Error("Invalid toDate. Must be a valid UTC date string.");
        }
        // ensure inclusive end-of-day for date-only strings
        to.setUTCHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    if (fullName && String(fullName).trim()) {
      const escaped = String(fullName)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      const matchedUsers = await UserModel.find({ fullName: regex })
        .select("_id")
        .lean();
      const userIds = matchedUsers.map((u) => u._id);

      if (userIds.length === 0) {
        const pagination = helper.paginationFun(req.query);
        const paginationData = helper.paginationDetails({
          limit: pagination.limit,
          page: parseInt(req.query.page, 10) || 1,
          totalItems: 0,
        });

        return apiResponse({
          res,
          statusCode: StatusCodes.OK,
          status: true,
          message: "Feedback fetched successfully.",
          pagination: paginationData,
          data: [],
        });
      }

      filter.createdBy = { $in: userIds };
    }

    const pagination = helper.paginationFun(req.query);

    const [count, fetchFeedbacks] = await Promise.all([
      FeedbackModel.countDocuments(filter),
      FeedbackModel.find(filter)
        .populate("createdBy", "fullName email profileImage")
        .skip(pagination.skip)
        .limit(pagination.limit)
        .sort({ createdAt: -1 }),
    ]);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: parseInt(req.query.page, 10) || 1,
      totalItems: count,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Feedback fetched successfully.",
      pagination: paginationData,
      data: fetchFeedbacks,
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.FEEDBACK.GET,
      activityCategory: enumConfig.activityCategoryEnum.FEEDBACK,
      description: error.message || "Failed to fetch feedback.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
      data: null,
    });
  }
};

const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await FeedbackModel.findByIdAndDelete(id);
    if (!result) {
      return apiResponse({
        res,
        statusCode: StatusCodes.NOT_FOUND,
        status: false,
        message: "Feedback not found.",
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.FEEDBACK.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.FEEDBACK,
      description: activityDescriptions.FEEDBACK.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Feedback deleted successfully",
      data: null,
    });
  } catch (error) {
    console.log(error);
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
      data: null,
    });
  }
};

export default { createFeedback, getFeedbacks, deleteFeedback };
