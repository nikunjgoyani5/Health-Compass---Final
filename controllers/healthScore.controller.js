import HealthScoreModel from "../models/healthScore.model.js";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";

const addHealthScore = async (req, res) => {
  try {
    const { score } = req.body;
    const userId = req.user.id;

    const payload = {
      userId: userId,
      score,
    };

    const healthScore = await HealthScoreModel.create(payload);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_SCORE.ADD,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_SCORE,
      description: activityDescriptions.HEALTH_SCORE.ADD,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Health score added successfully.",
      data: healthScore,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.log("Error while adding health score", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_SCORE.ADD,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_SCORE,
      description: error.message || "Failed to add health score.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Error while adding health score",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const getHealthScore = async (req, res) => {
  try {
    const userId = req.user.id;

    const scores = await HealthScoreModel.find({ userId }).sort({
      createdAt: -1,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_SCORE.GET,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_SCORE,
      description: activityDescriptions.HEALTH_SCORE.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Health scores retrieved successfully.",
      data: scores,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_SCORE.ADD,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_SCORE,
      description: error.message || "Failed to add health score.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Error while retrieving health scores",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export default {
  addHealthScore,
  getHealthScore,
};
