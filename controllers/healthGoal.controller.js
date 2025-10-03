import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import HealthGoalModel from "../models/healthGoal.model.js";
import enumConfig from "../config/enum.config.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";

const createHealthGoal = async (req, res) => {
  try {
    const {
      dailySteps,
      calories,
      waterIntake,
      sleepTarget,
      weightTarget,
      enableGamification,
    } = req.body;

    const user = req.user;

    const payload = {
      userId: user._id,
      dailySteps,
      calories,
      waterIntake,
      sleepTarget: parseInt(sleepTarget),
      weightTarget,
      enableGamification,
    };

    const healthGoal = await HealthGoalModel.findOneAndUpdate(
      { userId: user._id },
      payload,
      { upsert: true, new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_GOAL.SAVE,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_GOAL,
      description: activityDescriptions.HEALTH_GOAL.SAVE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Health goal saved successfully.",
      data: healthGoal,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.log("Error while saving health goal", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_GOAL.SAVE,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_GOAL,
      description: error.message || "Failed to save health-goal.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Error while saving health goal",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const getHealthGoal = async (req, res) => {
  try {
    const user = req.user;

    const healthGoal = await HealthGoalModel.findOne({ userId: user._id });
    if (!healthGoal) {
      return apiResponse({
        res,
        status: false,
        message: "Health goal not found",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_GOAL.GET,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_GOAL,
      description: activityDescriptions.HEALTH_GOAL.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Health goal fetched successfully.",
      data: healthGoal,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.log("Error while fetching health goal", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.HEALTH_GOAL.GET,
      activityCategory: enumConfig.activityCategoryEnum.HEALTH_GOAL,
      description: error.message || "Failed to fetch health-goal.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Error while fetching health goal",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export default {
  createHealthGoal,
  getHealthGoal,
};
