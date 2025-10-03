import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import UserModel from "../models/user.model.js";
import helper from "../helper/common.helper.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";

// -----------------------------
// Get My Caregivers
// -----------------------------
// This endpoint allows users to fetch the caregivers assigned to them. It supports search functionality and pagination.
const getMyCaregivers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search = "" } = req.query;

    const pagination = helper.paginationFun(req.query);

    const user = await UserModel.findById(userId).lean();

    if (!user || !user.myCaregivers?.length) {
      const paginationData = helper.paginationDetails({
        limit: pagination.limit,
        page: req.query.page,
        totalItems: 0,
      });

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message: "No caregivers found.",
        data: [],
        pagination: paginationData,
      });
    }

    const searchQuery = {
      _id: { $in: user.myCaregivers },
      is_deleted: false,
    };

    if (search.trim()) {
      searchQuery.$or = [
        { fullName: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
        { phoneNumber: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const total = await UserModel.countDocuments(searchQuery);

    const caregivers = await UserModel.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    for (let caregiver of caregivers) {
      if (caregiver.iCareFor?.length) {
        caregiver.iCareFor = await UserModel.find({
          _id: { $in: caregiver.iCareFor },
        })
          .select("_id email fullName profileImage inviteCode")
          .lean();
      } else {
        caregiver.iCareFor = [];
      }

      delete caregiver.password;
      delete caregiver.recoveryCode;
    }

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: total,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_CAREGIVER,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Caregivers fetched successfully.",
      data: caregivers,
      pagination: paginationData,
    });
  } catch (error) {
    console.error("Error fetching caregivers:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to fetch caregiver.",
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

// -----------------------------
// Get Users I Care For
// -----------------------------
// This endpoint allows caregivers to fetch the users they are responsible for. It supports search functionality and pagination.
const getICareFor = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search = "" } = req.query;

    const pagination = helper.paginationFun(req.query);

    const user = await UserModel.findById(userId).lean();

    if (!user || !user.iCareFor?.length) {
      const paginationData = helper.paginationDetails({
        limit: pagination.limit,
        page: req.query.page,
        totalItems: 0,
      });

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message: "No users you care for found.",
        data: [],
        pagination: paginationData,
      });
    }

    const searchQuery = {
      _id: { $in: user.iCareFor },
      is_deleted: false,
    };

    if (search.trim()) {
      searchQuery.$or = [
        { fullName: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
        { phoneNumber: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const total = await UserModel.countDocuments(searchQuery);

    const caredUsers = await UserModel.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    for (let user of caredUsers) {
      if (user.myCaregivers?.length) {
        user.myCaregivers = await UserModel.find({
          _id: { $in: user.myCaregivers },
        })
          .select("_id email fullName profileImage inviteCode")
          .lean();
      } else {
        user.myCaregivers = [];
      }

      delete user.password;
      delete user.recoveryCode;
    }

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: total,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.I_CARE_FOR,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Users you care for fetched successfully.",
      data: caredUsers,
      pagination: paginationData,
    });
  } catch (error) {
    console.error("Error fetching iCareFor:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to fetch iCareFor.",
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

export default {
  getMyCaregivers,
  getICareFor,
};
