import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import fileUploadService from "../services/file.upload.service.js";
import userServices from "../services/user.service.js";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import config from "../config/config.js";
import helper from "../helper/common.helper.js";
import emailService from "../services/email.service.js";
import bcrypt from "bcrypt";
import UserModel from "../models/user.model.js";
import DoctorAvailability from "../models/availability.model.js";
import CaregiverNote from "../models/caregiverNotes.model.js";
import ChatHistory from "../models/chatHistory.model.js";
import ConsultationModel from "../models/consultation.model.js";
import ContentHubModel from "../models/contenthub.model.js";
import FeedbackModel from "../models/feedback.model.js";
import Gamification from "../models/gamification.model.js";
import HealthGoalModel from "../models/healthGoal.model.js";
import Leaderboard from "../models/leaderboard.model.js";
import MedicineSchedule from "../models/medicine.schedual.model.js";
import Notification from "../models/notification.model.js";
import Onboarding from "../models/onboarding.model.js";
import QuestionModel from "../models/question.model.js";
import QuizModel from "../models/quiz.model.js";
import RequestModel from "../models/requestForCaregivers.model.js";
import ResultModel from "../models/result.model.js";
import Supplement from "../models/supplements.model.js";
import SupportRequest from "../models/support.model.js";
import Telemedicine from "../models/telemedicine.model.js";
import ActivityModel from "../models/activity-log.model.js";
import VaccineModel from "../models/vaccine.model.js";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import enumConfig from "../config/enum.config.js";
import Medicine from "../models/medicine.model.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";
import FriendModel from "../models/friend.model.js";
import IngredientModel from "../models/ingredient.model.js";
import StaticHealthBot from "../models/static-bot.model.js";
import SupplementViewLog from "../models/supplement-view-log.model.js";

// ---- Get User Profile -----
const getUserProfile = async (req, res) => {
  const userId = req.user.id;
  try {
    const [user, onboarding] = await Promise.all([
      UserModel.findOne({
        _id: userId,
        is_deleted: false,
      }).populate({
        path: "subscriptionDetails.planId",
        select: "access",
      }),
      Onboarding.findOne({ userId }),
    ]);

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const { password, otp, otpExpiresAt, paymentStatus, ...filteredUser } =
      user.toObject();

    const finalUser = {
      ...filteredUser,
      city: onboarding?.city || "Surat",
      age: onboarding?.age || null,
      weight: onboarding?.weight || null,
      height: onboarding?.height || null,
      heightUnit: onboarding?.heightUnit || null,
      weightUnit: onboarding?.weightUnit || null,
      goal: onboarding?.goal || [],
      activityLevel: onboarding?.activityLevel || null,
      city: onboarding?.city || "Surat",
    };

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.GET_PROFILE,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.GET_PROFILE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "User profile fetched successfully.",
      statusCode: StatusCodes.OK,
      data: finalUser,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.GET_PROFILE,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to fetch user profile.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Failed to fetch user profile.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// ---- Update User Profile ------
const updateUserProfile = async (req, res) => {
  const userId = req.user.id;
  const data = req.body;
  const file = req.file;

  const user = await UserModel.findOne({ _id: userId, is_deleted: false });

  if (!user) {
    return apiResponse({
      res,
      status: false,
      message: "User not found.",
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  try {
    let updateData = {};

    // ✅ Handle file upload
    if (file) {
      if (user?.profileImage) {
        await fileUploadService.deleteFile({ url: user?.profileImage });
      }
      const fileKey = await fileUploadService.uploadFile({
        mimetype: file.mimetype,
        buffer: file.buffer,
        folder: "user",
      });

      updateData.profileImage = fileKey;
    }

    // ✅ Deep merge helper
    const deepMerge = (target, source) => {
      if (!source || typeof source !== "object") return;
      for (const key of Object.keys(source)) {
        if (
          source[key] &&
          typeof source[key] === "object" &&
          !Array.isArray(source[key])
        ) {
          if (!target[key] || typeof target[key] !== "object") {
            target[key] = {};
          }
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    };

    deepMerge(updateData, data);

    // ✅ Validate goals
    if (data.goal && typeof data.goal === "string") {
      try {
        data.goal = JSON.parse(data.goal);

        if (!Array.isArray(data.goal)) {
          throw new Error("Goals must be an array");
        }

        const allowedGoals = Object.values(enumConfig.goalEnums);
        const invalidGoals = data.goal.filter((g) => !allowedGoals.includes(g));

        if (invalidGoals.length > 0) {
          throw new Error(`Goals must be one of [${allowedGoals.join(", ")}]`);
        }
      } catch (e) {
        return apiResponse({
          res,
          status: false,
          data: null,
          message:
            e.message ||
            `Goals must be one of [${Object.values(enumConfig.goalEnums).join(
              ", "
            )}]`,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }

    // ✅ Onboarding update
    const onboardingKeys = [
      "age",
      "weight",
      "height",
      "heightUnit",
      "weightUnit",
      "goal",
      "gender",
      "activityLevel",
    ];

    const onboardingUpdate = {};
    for (const key of onboardingKeys) {
      if (data[key] !== undefined) {
        onboardingUpdate[key] = data[key];
      }
    }

    let updatedOnboarding = null;
    if (Object.keys(onboardingUpdate).length > 0) {
      updatedOnboarding = await Onboarding.findOneAndUpdate(
        { userId: userId },
        { $set: onboardingUpdate },
        { new: true, upsert: true }
      ).lean();
    }

    // ✅ Update user
    const updatedUser = await UserModel.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).lean();

    // ✅ Merge user + onboard in one response
    let mergedData = {
      ...updatedUser,
      ...(updatedOnboarding || {}),
    };

    // ❌ Remove sensitive fields
    delete mergedData.password;
    delete mergedData.otp;
    delete mergedData.otpExpiresAt;
    delete mergedData.paymentStatus;

    return apiResponse({
      res,
      status: true,
      message: "User profile updated successfully.",
      statusCode: StatusCodes.OK,
      data: mergedData,
    });
  } catch (error) {
    console.error("Profile update error:", error);

    return apiResponse({
      res,
      status: false,
      message: "Failed to update user profile.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// ---- Delete User Account (Soft delete / permanently delete) -----
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const { isPermanentlyDelete } = req.body;

    const user = await userServices.findOne({ _id: userId });
    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    if (isPermanentlyDelete) {
      await Promise.all([
        DoctorAvailability.deleteMany({ doctorId: userId }),
        CaregiverNote.deleteMany({
          $or: [{ caregiver: userId }, { user: userId }],
        }),
        ChatHistory.deleteMany({ userId }),
        ConsultationModel.deleteMany({
          $or: [{ doctor: userId }, { patient: userId }],
        }),
        ContentHubModel.deleteMany({ createdBy: userId }),
        FeedbackModel.deleteMany({ createdBy: userId }),
        FriendModel.deleteMany({ userId: userId }),
        Gamification.deleteMany({ userId }),
        HealthGoalModel.deleteMany({ userId }),
        IngredientModel.deleteMany({
          createdBy: userId,
          createdByAdmin: false,
        }),
        Medicine.deleteMany({ userId: userId, createdByAdmin: false }),
        Supplement.deleteMany({ createdBy: userId, createdByAdmin: false }),
        VaccineModel.deleteMany({ createdBy: userId, createdByAdmin: false }),
        MedicineSchedule.deleteMany({ userId }),
        Leaderboard.deleteMany({ userId }),
        Notification.deleteMany({ userId }),
        Onboarding.deleteMany({ userId }),
        QuestionModel.deleteMany({ createdBy: userId }),
        QuizModel.deleteMany({ createdBy: userId }),
        RequestModel.deleteMany({
          $or: [{ sender: userId }, { receiver: userId }],
        }),
        ResultModel.deleteMany({ attemptBy: userId }),
        SupportRequest.deleteMany({ userId }),
        Telemedicine.deleteMany({ $or: [{ userId }, { doctorId: userId }] }),
        ActivityModel.deleteMany({ userId }),
        VaccineSchedule.deleteMany({ scheduleBy: userId }),
        ActivityModel.deleteMany({ userId: userId }),
        SupplementViewLog.deleteMany({ userId: userId }),
        StaticHealthBot.deleteMany({ createdBy: userId }),
      ]);

      await userServices.deleteOne({ _id: userId });
    } else {
      await userServices.findByIdAndUpdate(userId, { is_deleted: true });
      await activityLogService.createActivity({
        userId: req.user._id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.USER.DELETE_ACCOUNT,
        activityCategory: enumConfig.activityCategoryEnum.USER,
        description: activityDescriptions.USER.DELETE_ACCOUNT,
        status: enumConfig.activityStatusEnum.SUCCESS,
      });
    }

    return apiResponse({
      res,
      status: true,
      message: "Account deleted successfully",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.DELETE_ACCOUNT,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to delete user account.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

// ---- Enable 2Factor authentication -----
const enable2fa = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      length: 20,
      name: config.appName,
    });

    QRCode.toDataURL(secret.otpauth_url, async (err, data_url) => {
      if (data_url) {
        const imageUrl = await fileUploadService.handleFile(
          data_url,
          "twofactorqr"
        );
        const otpArray = helper.generateOTPArray(6, 5);

        await userServices.findByIdAndUpdate(req.user._id, {
          secretKey: secret.base32,
          twoFactorQr: imageUrl,
          isTwoFactorEnabled: true,
          recoveryCode: otpArray,
        });

        await emailService.send2FaEmail({
          email: req.user.email,
          username: req.user.fullName,
          twofactorqr: imageUrl,
        });

        await activityLogService.createActivity({
          userId: req.user._id,
          userRole: Array.isArray(req.user.role)
            ? req.user.role
            : [req.user.role],
          activityType: enumConfig.activityTypeEnum.USER.ENABLE_2_FA,
          activityCategory: enumConfig.activityCategoryEnum.USER,
          description: activityDescriptions.USER.ENABLE_2_FA,
          status: enumConfig.activityStatusEnum.SUCCESS,
        });

        return apiResponse({
          res,
          status: true,
          statusCode: StatusCodes.OK,
          message: "Two factor authenticate enable successfully.",
          data: imageUrl,
        });
      }
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.ENABLE_2_FA,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description:
        error.message || "Failed to enable two factor authentication.",
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

// ---- Disable 2Factor Authentication --------
const disable2fa = async (req, res) => {
  try {
    if (req.user.twoFactorQr)
      fileUploadService.deleteFile({ url: req.user.twoFactorQr });

    await userServices.findByIdAndUpdate(req.user._id, {
      secretKey: "",
      twoFactorQr: "",
      isTwoFactorEnabled: false,
      recoveryCode: [],
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.DISABLE_2_FA,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.DISABLE_2_FA,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Two factor authenticate disable successfully",
      data: null,
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.DISABLE_2_FA,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description:
        error.message || "Failed to disable two factor authentication.",
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

// ----- Regenerate Recovery Code -----
const regenerateRecoveryCode = async (req, res) => {
  try {
    const check2Fa = await userServices.findById(req.user._id);
    if (!check2Fa.isTwoFactorEnabled) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Two-factor authentication is not enabled for this account.",
        data: null,
      });
    }

    const otpArray = helper.generateOTPArray(6, 5);
    await userServices.findByIdAndUpdate(req.user._id, {
      recoveryCode: otpArray,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.REGENERATE_RECOVERY_CODE,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.REGENERATE_RECOVERY_CODE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Regenerate Recovery Code successfully",
      data: otpArray,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.REGENERATE_RECOVERY_CODE,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to regenerate recovery code.",
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

// ----- Verify 2factor OTP -------
const verify2faOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    let isRecoveryCode = false;
    const isValidToken = speakeasy.totp.verify({
      secret: req.user.secretKey,
      encoding: "base32",
      token: otp,
    });

    if (!isValidToken)
      isRecoveryCode = req.user.recoveryCode.includes(Number(otp));

    if (isValidToken || isRecoveryCode) {
      const token = await helper.generateToken({ userId: req.user._id });
      return apiResponse({
        res,
        status: true,
        statusCode: StatusCodes.OK,
        message: "OTP verify successfully.",
        data: { isVerify: true, token },
      });
    } else {
      return apiResponse({
        res,
        status: false,
        message: "Invalid OTP",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.VERIFY_2_FA_OTP,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to verify two factor OTP.",
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

// ---- Change Password --------
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    let user = await userServices.findOne({ _id: userId, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found",
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
      });
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordValid) {
      return apiResponse({
        res,
        status: false,
        message: "Old password is incorrect",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    // ✅ Check newPassword is not same as old password
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return apiResponse({
        res,
        status: false,
        message: "New password cannot be the same as old password",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    const hashNewPassword = await bcrypt.hash(newPassword, 10);

    await userServices.update({ _id: userId }, { password: hashNewPassword });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Password changed successfully",
      data: null,
    });
  } catch (error) {
    console.error("Error in changePassword:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.CHANGE_PASS,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to change password.",
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

// ----- Update Role By Admin --------
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const findById = await userServices.findById(id);
    if (!findById) {
      return apiResponse({
        res,
        status: false,
        message: "User not found",
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
      });
    }
    const user = await userServices.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    );
    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "User role updated successfully",
      data: user,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.UPDATE_ROLE,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to update role.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Failed to update user role",
      data: null,
    });
  }
};

// ---- Update FCM Token --------
const updateUserFCMToken = async (req, res) => {
  const userId = req.user.id;
  const { fcmToken } = req.body;
  try {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { fcmToken } },
      { new: true }
    );
    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.UPDATE_FCM_TOKEN,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.UPDATE_FCM_TOKEN,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "User fcm token updated successfully.",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.UPDATE_FCM_TOKEN,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to update fcm token.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Failed to update fcm push token.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// ---- Update Activity By Admin --------
const updateUserActiveStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;

    const isExist = await UserModel.findById(userId);
    if (!isExist) {
      return apiResponse({
        res,
        status: false,
        message: "User not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    isExist.is_active = is_active;
    await isExist.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.UPDATE_ACTIVITY_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: is_active ? "Status activated" : "Status deactivated",
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: is_active ? "Status activated" : "Status deactivated",
      statusCode: StatusCodes.NOT_FOUND,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.UPDATE_ACTIVITY_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description:
        error.message ||
        "Failed to activate or deactivate user account status.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Internal server error.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// ---- Get User List By Admin -------
const getUserListByAdmin = async (req, res) => {
  try {
    const { role, fullName, startDate, endDate, search } = req.query;

    const filter = {};

    const baseRole = {
      $nin: ["admin", "superadmin"],
      $in: ["user", "caregiver"],
    };

    // if client passed role param, we intersect with $in (but still keep baseRole constraints)
    const roleArrayFromQuery = role
      ? (Array.isArray(role) ? role : role.split(",")).map((r) =>
          String(r).trim()
        )
      : null;

    if (roleArrayFromQuery && roleArrayFromQuery.length) {
      const safeIn = roleArrayFromQuery.filter((r) =>
        ["user", "caregiver"].includes(r)
      );
      filter.role = {
        ...baseRole,
        ...(safeIn.length ? { $in: safeIn } : {}),
      };
    } else {
      filter.role = baseRole;
    }

    // Optional name filter
    if (fullName) filter.fullName = new RegExp(fullName, "i");

    // Date range on createdAt
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start) && !isNaN(end)) {
        const startOfDay = new Date(start.setHours(0, 0, 0, 0));
        const endOfDay = new Date(end.setHours(23, 59, 59, 999));
        filter.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
    }

    const { skip, limit } = helper.paginationFun(req.query);

    // Projection: role -> only ["user"] if contains user, else []
    const projectFields = {
      fullName: 1,
      email: 1,
      is_caregiver_block: 1,
      profileImage: 1,
      phoneNumber: 1,
      createdAt: 1,
      inviteCode: 1,
      is_active: 1,
      isBlocked: 1,
      role: {
        $filter: {
          input: "$role",
          as: "r",
          cond: { $in: ["$$r", ["user", "caregiver"]] },
        },
      },
    };

    let data = [];
    let totalItems = 0;

    if (search) {
      // ---------------- SEARCH MODE (priority + page-limited processing) ----------------
      const regex = new RegExp(search, "i");

      const baseStages = [
        { $match: filter },
        {
          $addFields: {
            priority: {
              $cond: [
                { $regexMatch: { input: "$fullName", regex } },
                1,
                {
                  $cond: [
                    { $regexMatch: { input: "$email", regex } },
                    2,
                    {
                      $cond: [
                        { $regexMatch: { input: "$phoneNumber", regex } },
                        3,
                        4,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $match: { priority: { $lt: 4 } } },
      ];

      // Count for pagination (same filters)
      const countAgg = await UserModel.aggregate([
        ...baseStages,
        { $count: "cnt" },
      ]);
      totalItems = countAgg?.[0]?.cnt || 0;

      // Page data (sort by priority then createdAt desc), then skip/limit and project
      data = await UserModel.aggregate([
        ...baseStages,
        { $sort: { priority: 1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: projectFields },
      ]);
    } else {
      // ---------------- NON-SEARCH MODE (simple filtered page) ----------------
      totalItems = await UserModel.countDocuments(filter);

      data = await UserModel.aggregate([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: projectFields },
      ]);
    }

    const pagination = helper.paginationDetails({
      limit,
      page: req.query.page,
      totalItems,
    });

    // Activity log (success)
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.GET,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "User list fetched successfully",
      pagination,
      data, // if your apiResponse maps this to body, it'll appear under "body" as in your sample
    });
  } catch (error) {
    // Activity log (error)
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.GET,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to fetch user list by admin.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Internal server error.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const setPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.id;

    const user = await userServices.findOne({ _id: userId, is_deleted: false });
    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found",
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
      });
    }

    if (user.provider === enumConfig.authProviderEnum.EMAIL) {
      return apiResponse({
        res,
        status: false,
        message: "Only Google and Apple users can set password",
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await userServices.update({ _id: userId }, { password: hashedPassword });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.SET_PASS,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.SET_PASS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Password set successfully",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.error("Error in setPassword:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.SET_PASS,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to set password.",
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

const getnotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await UserModel.findById(userId).select(
      "notificationPreferences"
    );
    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "Admin not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.GET_NOTI_PREF,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.GET_NOTI_PREF,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Notification preferences fetched successfully.",
      data: user,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.GET_NOTI_PREF,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: error.message || "Failed to fetch notification preferences.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Failed to fetch notification preferences.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const updatenotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences, reminderFrequency } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: `${user.role} not found.`,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    // Update notificationPreferences object on user document
    user.notificationPreferences = {
      preferences: preferences || user.notificationPreferences.preferences,
      reminderFrequency:
        reminderFrequency || user.notificationPreferences.reminderFrequency,
    };

    // Save updated admin document
    await user.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.UPDATE_NOTI_PREF,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description: activityDescriptions.USER.UPDATE_NOTI_PREF,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Notification preferences updated successfully.",
      data: user.notificationPreferences,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.error("Error updating notification preferences:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.USER.UPDATE_NOTI_PREF,
      activityCategory: enumConfig.activityCategoryEnum.USER,
      description:
        error.message || "Failed to update notification preferences.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Failed to update notification preferences.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export default {
  getUserProfile,
  updateUserProfile,
  deleteAccount,
  enable2fa,
  disable2fa,
  regenerateRecoveryCode,
  verify2faOtp,
  changePassword,
  updateRole,
  updateUserFCMToken,
  updateUserActiveStatus,
  getUserListByAdmin,
  setPassword,
  updatenotificationPreferences,
  getnotificationPreferences,
};
