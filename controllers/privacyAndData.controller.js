import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import UserModel from "../models/user.model.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";
import Onboarding from "../models/onboarding.model.js";

const updatePrivacySetting = async (req, res) => {
  try {
    const { enableDataSharing, analyticsConsent, perspective } = req.body;
    const userId = req.user._id;

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          "privacySettings.enableDataSharing": enableDataSharing,
          "privacySettings.analyticsConsent": analyticsConsent,
        },
      },
      { new: true, runValidators: true, projection: { privacySettings: 1 } }
    );

    if (!updatedUser) {
      return apiResponse({
        res,
        status: false,
        message: "User not found",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const data = await Onboarding.findOneAndUpdate(
      { userId },
      {
        $set: { perspective: perspective },
      },
      { new: true, runValidators: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.PRIVACY_POLICY.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.PRIVACY_POLICY,
      description: activityDescriptions.PRIVACY_POLICY.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Privacy setting updated successfully",
      data: {
        ...updatedUser.privacySettings,
        perspective: data?.perspective || enumConfig.perspectiveEnums.BALANCED,
      },
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.log("Error while updating privacy setting", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.PRIVACY_POLICY.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.PRIVACY_POLICY,
      description: error.message || "Failed to update privacy policy.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      message: "Error while updating privacy setting",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const getPrivacySetting = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await UserModel.findById(userId)
      .select("privacySettings")
      .lean();
    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const perspective = await Onboarding.findOne({ userId })
      .select("perspective")
      .lean();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.PRIVACY_POLICY.GET,
      activityCategory: enumConfig.activityCategoryEnum.PRIVACY_POLICY,
      description: activityDescriptions.PRIVACY_POLICY.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Privacy setting fetched successfully",
      data: {
        ...user,
        perspective:
          perspective?.perspective || enumConfig.perspectiveEnums.BALANCED,
      },
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.log("Error while fetching privacy setting", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.PRIVACY_POLICY.GET,
      activityCategory: enumConfig.activityCategoryEnum.PRIVACY_POLICY,
      description: error.message || "Failed to fetch privacy policy.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      message: "Error while fetching privacy setting",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export default {
  updatePrivacySetting,
  getPrivacySetting,
};
