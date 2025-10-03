import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import enumConfig from "../config/enum.config.js";
import UserModel from "../models/user.model.js";
import emailServices from "../services/email.service.js";
import helper from "../helper/common.helper.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";

const getAdmins = async (req, res) => {
  try {
    const filter = {};
    const { fullName, email, isVerified, isBlocked, status } = req.query;

    if (fullName) filter.fullName = { $regex: fullName, $options: "i" };
    if (email) filter.email = { $regex: email, $options: "i" };
    if (isVerified) filter.is_verified = isVerified;

    if (isBlocked !== undefined) {
      if (isBlocked === "true") filter.isBlocked = true;
      else if (isBlocked === "false") filter.isBlocked = false;
    }

    // ✅ Add status filter if provided
    if (status) {
      const validStatuses = [
        enumConfig.superadminApproveStatusEnum.PENDING,
        enumConfig.superadminApproveStatusEnum.APPROVED,
        enumConfig.superadminApproveStatusEnum.REJECTED,
      ];
      if (validStatuses.includes(status)) {
        filter.superadminApproveStatus = status;
      }
    }

    filter.role = { $in: [enumConfig.userRoleEnum.ADMIN] };

    const pagination = helper.paginationFun(req.query);

    const admins = await UserModel.find(filter)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .select(
        "email fullName profileImage role is_verified isBlocked blockedBy superadminApproveStatus"
      )
      .sort({ createdAt: -1 });

    const count = await UserModel.countDocuments(filter);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: count,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPER_ADMIN.FETCH_ADMIN,
      activityCategory: enumConfig.activityCategoryEnum.SUPER_ADMIN,
      description: activityDescriptions.SUPER_ADMIN.FETCH_ADMIN,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Admins fetched successfully.",
      data: admins,
      pagination: paginationData,
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPER_ADMIN.FETCH_ADMIN,
      activityCategory: enumConfig.activityCategoryEnum.SUPER_ADMIN,
      description:
        error.message || "Failed to fetch admin list by super-admin.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

const approveAndRejectAdminUser = async (req, res) => {
  try {
    const { registerAdminId, status } = req.body;

    const user = await UserModel.findById(registerAdminId);
    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Admin not found.",
      });
    }

    const isVerified =
      status === enumConfig.superadminApproveStatusEnum.APPROVED ? true : false;
    user.isVerified = isVerified;
    user.is_active = isVerified;

    user.superadminApproveStatus = isVerified
      ? enumConfig.superadminApproveStatusEnum.APPROVED
      : status === enumConfig.superadminApproveStatusEnum.PENDING
      ? enumConfig.superadminApproveStatusEnum.PENDING
      : enumConfig.superadminApproveStatusEnum.REJECTED;

    await user.save();

    if (status !== enumConfig.superadminApproveStatusEnum.PENDING) {
      if (isVerified) {
        await emailServices.sendAdminApprovalEmail({
          email: user.email,
          fullName: user.fullName,
        });
      } else {
        await emailServices.sendAdminRejectEmail({
          email: user.email,
          fullName: user.fullName,
        });
      }
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.SUPER_ADMIN.APPROVED_REJECT_ADMIN,
      activityCategory: enumConfig.activityCategoryEnum.SUPER_ADMIN,
      description: isVerified
        ? "Admin approved successfully."
        : status === enumConfig.superadminApproveStatusEnum.PENDING
        ? "Admin Pending status updated successfully."
        : "Admin rejected successfully.",
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: isVerified
        ? "Admin approved successfully."
        : status === enumConfig.superadminApproveStatusEnum.PENDING
        ? "Admin Pending status updated successfully."
        : "Admin rejected successfully.",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.error(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.SUPER_ADMIN.APPROVED_REJECT_ADMIN,
      activityCategory: enumConfig.activityCategoryEnum.SUPER_ADMIN,
      description:
        error.message || "Failed to fetch admin list by super-admin.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

const blockAndUnblockAdmin = async (req, res) => {
  try {
    const { adminId, isBlocked } = req.body;
    const superAdmin = req.user;

    const user = await UserModel.findById(adminId);
    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Admin not found",
        data: null,
      });
    }

    if (!user.role.includes(enumConfig.userRoleEnum.ADMIN)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "User does not have an Admin role.",
      });
    }

    user.isBlocked = isBlocked;
    user.blockedBy = isBlocked ? superAdmin._id : null;

    await user.save();

    if (isBlocked) {
      await emailServices.sendAdminBlockEmail({
        email: user.email,
        fullName: user.fullName,
      });
    } else {
      await emailServices.sendAdminUnblockEmail({
        email: user.email,
        fullName: user.fullName,
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPER_ADMIN.BLOCK_UNBLOCK_ADMIN,
      activityCategory: enumConfig.activityCategoryEnum.SUPER_ADMIN,
      description: isBlocked
        ? "Admin blocked successfully."
        : "Admin unblocked successfully.",
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: isBlocked
        ? "Admin blocked successfully."
        : "Admin unblocked successfully.",
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPER_ADMIN.BLOCK_UNBLOCK_ADMIN,
      activityCategory: enumConfig.activityCategoryEnum.SUPER_ADMIN,
      description:
        error.message || "Failed to block-unblock admin by super-admin.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

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
  getAdmins,
  approveAndRejectAdminUser,
  blockAndUnblockAdmin,
};
