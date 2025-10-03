import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import userServices from "../services/user.service.js";
import helper from "../helper/common.helper.js";
import UserModel from "../models/user.model.js";
import MedicineSchedule from "../models/medicine.schedual.model.js";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import VaccineModel from "../models/vaccine.model.js";
import DoctorAvailability from "../models/availability.model.js";
import enums from "../config/enum.config.js";
import Telemedicine from "../models/telemedicine.model.js";
import mongoose from "mongoose";
import MedicineScheduleModel from "../models/medicine.schedual.model.js";
import enumConfig from "../config/enum.config.js";
import SupplementTag from "../models/supplement-tag.model.js";
import slugify from "slugify";
import featureFlags from "../services/feature-flags.service.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";
import FeatureFlagModel from "../models/feature-flags.model.js";
import HealthGoalModel from "../models/healthGoal.model.js";
import Onboarding from "../models/onboarding.model.js";
import SupplementModel from "../models/supplements.model.js";
import MentalHealth from "../models/mentalhealth.assessment.schema.js";
import moment from "moment";

// -------------------------------
// Get All User Profiles (Admin)
// -------------------------------
// Fetches a paginated list of users (excluding Admins),
// allows filtering by role, blocked status, user ID, or search keyword.
const getAllUserProfile = async (req, res) => {
  try {
    const { role, isBlocked, id, search, page = 1, limit = 10 } = req.query;

    const query = { is_deleted: false };

    // Always exclude ADMIN role
    query.role = { $ne: enums.userRoleEnum.ADMIN };

    // If specific role is requested and it's not ADMIN, apply it
    if (role && role !== enums.userRoleEnum.ADMIN) {
      query.role = { $eq: role };
    }

    if (isBlocked !== undefined) {
      if (isBlocked === "true") query.isBlocked = true;
      else if (isBlocked === "false") query.isBlocked = false;
    }

    if (id) query._id = id;

    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { fullName: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { phoneNumber: { $regex: searchRegex } },
        { specialization: { $regex: searchRegex } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, totalItems] = await Promise.all([
      UserModel.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      UserModel.countDocuments(query),
    ]);

    const filteredUsers = users.map((user) => {
      const {
        password,
        otp,
        otpExpiresAt,
        paymentStatus,
        subscriptionDetails,
        countryCode,
        ...rest
      } = user.toObject();
      return rest;
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_ALL_USER_PROFILE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_ALL_USER_PROFILE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Users loaded successfully.",
      statusCode: StatusCodes.OK,
      data: filteredUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_ALL_USER_PROFILE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to load users. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      message: "Unable to load users. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// -------------------------------
// Block / Unblock User Profile
// -------------------------------
// Updates the 'isBlocked' status of a user.
// Records which admin blocked/unblocked the user.
const blockAndUnblockUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;
    const adminId = req.user.id;

    const user = await userServices.findOne({ _id: id, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    // Update the user's block status
    await userServices.updateOne(
      { _id: id },
      {
        isBlocked: isBlocked,
        blockedBy: isBlocked ? adminId : null,
      }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.ADMIN.BLOCK_UNBLOCK_USER_PROFILE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: `User has been ${
        isBlocked ? "blocked" : "unblocked"
      } successfully.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: `User has been ${
        isBlocked ? "blocked" : "unblocked"
      } successfully.`,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.ADMIN.BLOCK_UNBLOCK_USER_PROFILE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message ||
        "Unable to update user status. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Unable to update user status. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// -------------------------------
// Get User Medicine Schedules
// -------------------------------
// Retrieves medicine schedules for a user with optional filters:
// date range, dose status, and specific medicine.
// Aggregates and formats dose logs for easier consumption.
const getUserMedicineSchedules = async (req, res) => {
  try {
    const { userId, dateFrom, dateTo, doseStatus, medicineName } = req.query;

    const matchStage = {};

    if (userId) {
      matchStage.userId = new mongoose.Types.ObjectId(userId);
    }

    if (medicineName) {
      matchStage.medicineName = new mongoose.Types.ObjectId(medicineName);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "medicines",
          localField: "medicineName",
          foreignField: "_id",
          as: "medicineDetails",
        },
      },
      {
        $unwind: {
          path: "$medicineDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $unwind: "$doseLogs" },
      { $unwind: "$doseLogs.doses" },
    ];

    // Date filter on doseLogs.date
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : new Date("1970-01-01");
      const to = dateTo ? new Date(dateTo) : new Date();
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);

      pipeline.push({
        $match: {
          "doseLogs.date": {
            $gte: from,
            $lte: to,
          },
        },
      });
    }

    // Dose status filter
    if (doseStatus) {
      pipeline.push({
        $match: {
          "doseLogs.doses.status": doseStatus,
        },
      });
    }

    pipeline.push({
      $group: {
        _id: "$_id",
        userId: { $first: "$userId" },
        userName: { $first: "$userDetails.fullName" },
        medicineId: { $first: "$medicineName" },
        medicineName: { $first: "$medicineDetails.medicineName" },
        dosage: { $first: "$dosage" },
        quantity: { $first: "$quantity" },
        price: { $first: "$price" },
        startDate: { $first: "$startDate" },
        endDate: { $first: "$endDate" },
        totalDosesPerDay: { $first: "$totalDosesPerDay" },
        createdAt: { $first: "$createdAt" },
        updatedAt: { $first: "$updatedAt" },
        filteredDoses: {
          $push: {
            date: "$doseLogs.date",
            time: "$doseLogs.doses.time",
            status: "$doseLogs.doses.status",
            isReminderSent: "$doseLogs.doses.isReminderSent",
          },
        },
      },
    });

    pipeline.push({ $sort: { startDate: -1 } });

    // Pagination
    const pagination = helper.paginationFun(req.query);
    const paginatedPipeline = [
      ...pipeline,
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ];

    const [schedules, totalItemsAgg] = await Promise.all([
      MedicineSchedule.aggregate(paginatedPipeline),
      MedicineSchedule.aggregate(pipeline),
    ]);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: totalItemsAgg.length,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_MEDICINE_SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_MEDICINE_SCHEDULE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Medicine schedules fetched successfully.",
      statusCode: StatusCodes.OK,
      data: schedules,
      pagination: paginationData,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_MEDICINE_SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message ||
        "Unable to fetch medicine schedules. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Unable to fetch medicine schedules. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

// -------------------------------
// Get User Vaccine Schedules
// -------------------------------
// Retrieves vaccine schedules for a user with optional filters:
// vaccine name, dose status, and date range.
// Aggregates user and vaccine details for display.
const getUserVaccineSchedules = async (req, res) => {
  try {
    const { userId, vaccineName, doseStatus, dateFrom, dateTo } = req.query;

    const matchStage = {};

    if (userId) {
      matchStage.scheduleBy = new mongoose.Types.ObjectId(userId);
    }

    if (doseStatus) {
      matchStage.scheduleStatus = doseStatus;
    }

    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : new Date("1970-01-01");
      const to = dateTo ? new Date(dateTo) : new Date();
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      matchStage.date = { $gte: from, $lte: to };
    }

    // vaccineName filter → resolve vaccine IDs
    if (vaccineName) {
      const vaccines = await VaccineModel.find({
        vaccineName: { $regex: new RegExp(vaccineName, "i") },
      }).select("_id");

      const vaccineIds = vaccines.map((v) => v._id);
      matchStage.vaccineId = { $in: vaccineIds };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "scheduleBy",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "vaccines",
          localField: "vaccineId",
          foreignField: "_id",
          as: "vaccineDetails",
        },
      },
      {
        $unwind: {
          path: "$vaccineDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          date: 1,
          doseTime: 1,
          scheduleStatus: 1,
          createdAt: 1,
          updatedAt: 1,
          "userDetails._id": 1,
          "userDetails.fullName": 1,
          "userDetails.email": 1,
          "vaccineDetails._id": 1,
          "vaccineDetails.vaccineName": 1,
          "vaccineDetails.provider": 1,
        },
      },
      { $sort: { date: -1 } },
    ];

    // Pagination
    const pagination = helper.paginationFun(req.query);
    const paginatedPipeline = [
      ...pipeline,
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ];

    // ✅ Ensure you call the correct model here
    const [schedules, totalItemsAgg] = await Promise.all([
      VaccineSchedule.aggregate(paginatedPipeline),
      VaccineSchedule.aggregate(pipeline),
    ]);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: totalItemsAgg.length,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_VACCINE_SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_VACCINE_SCHEDULE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Vaccine schedules fetched successfully.",
      statusCode: StatusCodes.OK,
      data: schedules,
      pagination: paginationData,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_VACCINE_SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message ||
        "Unable to fetch vaccine schedules. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Unable to fetch vaccine schedules. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

// -------------------------------
// Get Doctor Availability
// -------------------------------
// Fetches doctor availability for given doctorId, day,
// start and end times. Returns structured shifts grouped by day.
const getDoctorAvailability = async (req, res) => {
  try {
    const { doctorId, day, startTime, endTime } = req.query;
    const pagination = helper.paginationFun(req.query);

    const matchStage = {};

    if (doctorId) {
      matchStage.doctorId = new mongoose.Types.ObjectId(doctorId);
    }

    const pipeline = [{ $match: matchStage }, { $unwind: "$availability" }];

    if (day) {
      pipeline.push({
        $match: {
          "availability.day": { $regex: new RegExp(`^${day}$`, "i") },
        },
      });
    }

    pipeline.push({ $unwind: "$availability.shift" });

    if (startTime) {
      pipeline.push({
        $match: {
          "availability.shift.startTime": startTime,
        },
      });
    }

    if (endTime) {
      pipeline.push({
        $match: {
          "availability.shift.endTime": endTime,
        },
      });
    }

    pipeline.push({
      $group: {
        _id: {
          doctorId: "$doctorId",
          day: "$availability.day",
        },
        shifts: {
          $push: "$availability.shift",
        },
      },
    });

    pipeline.push({
      $group: {
        _id: "$_id.doctorId",
        availability: {
          $push: {
            day: "$_id.day",
            shift: "$shifts",
          },
        },
      },
    });

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "doctorDetails",
      },
    });

    pipeline.push({ $unwind: "$doctorDetails" });

    pipeline.push({
      $project: {
        _id: 1,
        doctorId: "$_id",
        doctorName: "$doctorDetails.fullName",
        doctorProfilePicture: "$doctorDetails.profileImage",
        doctorinviteCode: "$doctorDetails.inviteCode",
        availability: 1,
      },
    });

    pipeline.push({ $sort: { doctorName: 1 } });

    const paginatedPipeline = [
      ...pipeline,
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ];

    const [data, totalData] = await Promise.all([
      DoctorAvailability.aggregate(paginatedPipeline),
      DoctorAvailability.aggregate(pipeline),
    ]);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: totalData.length,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_DOCTOR_AVAILABILITIES,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_DOCTOR_AVAILABILITIES,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Doctor availability loaded successfully.",
      statusCode: StatusCodes.OK,
      data,
      pagination: paginationData,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_DOCTOR_AVAILABILITIES,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message ||
        "Unable to load doctor availability. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      message: "Unable to load doctor availability. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

// -------------------------------
// Get Telemedicine Appointments
// -------------------------------
// Retrieves telemedicine appointments with optional filters:
// userId, doctorId, appointment date range, appointment type,
// status, and call success. Returns paginated and enriched data
// including user and doctor details.
const getTelemedicineAppointments = async (req, res) => {
  try {
    const {
      userId,
      doctorId,
      appointmentDate,
      appointmentType,
      status,
      wasSuccessful,
      startDate,
      endDate,
    } = req.query;

    const matchStage = {};

    if (userId) {
      matchStage.userId = new mongoose.Types.ObjectId(userId);
    }

    if (doctorId) {
      matchStage.doctorId = new mongoose.Types.ObjectId(doctorId);
    }

    if (appointmentDate) {
      const date = new Date(appointmentDate);
      const from = new Date(date.setHours(0, 0, 0, 0));
      const to = new Date(date.setHours(23, 59, 59, 999));
      matchStage.appointmentDate = { $gte: from, $lte: to };
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (!isNaN(start) && !isNaN(end)) {
        const startOfDay = new Date(start.setHours(0, 0, 0, 0));
        const endOfDay = new Date(end.setHours(23, 59, 59, 999));

        matchStage.appointmentDate = {
          $gte: startOfDay,
          $lte: endOfDay,
        };
      }
    }

    if (appointmentType) {
      matchStage.appointmentType = appointmentType;
    }

    if (status) {
      matchStage.status = status;
    }

    if (wasSuccessful === "true" || wasSuccessful === "false") {
      matchStage["videoCall.wasSuccessful"] = wasSuccessful === "true";
    }

    const pagination = helper.paginationFun(req.query);

    const pipeline = [
      { $match: matchStage },

      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "users",
          localField: "doctorId",
          foreignField: "_id",
          as: "doctorDetails",
        },
      },
      { $unwind: { path: "$doctorDetails", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          appointmentType: 1,
          appointmentDate: 1,
          appointmentStartTime: 1,
          appointmentEndTime: 1,
          status: 1,
          wasSuccessful: "$videoCall.wasSuccessful",
          createdAt: 1,
          updatedAt: 1,
          user: {
            id: "$userDetails._id",
            name: "$userDetails.fullName",
            profilePicture: "$userDetails.profileImage",
            inviteCode: "$userDetails.inviteCode",
          },
          doctor: {
            id: "$doctorDetails._id",
            name: "$doctorDetails.fullName",
            profilePicture: "$doctorDetails.profileImage",
            inviteCode: "$doctorDetails.inviteCode",
          },
        },
      },

      { $sort: { appointmentDate: -1, appointmentStartTime: 1 } },
    ];

    const paginatedPipeline = [
      ...pipeline,
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ];

    const [appointments, allData] = await Promise.all([
      Telemedicine.aggregate(paginatedPipeline),
      Telemedicine.aggregate(pipeline),
    ]);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: allData.length,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_TELEMEDICINE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_TELEMEDICINE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Appointments loaded successfully.",
      statusCode: StatusCodes.OK,
      data: appointments,
      pagination: paginationData,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_TELEMEDICINE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to load appointments. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Unable to load appointments. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

// -------------------------------
// Assign Role To User (Admin)
// -------------------------------
// Adds a new role to a user, ensuring no duplicates.
// Logs the action for audit purposes and returns updated user info.
const assignRoleToUser = async (req, res) => {
  try {
    const { userId, role } = req.body;

    const user = await UserModel.findOne({ _id: userId, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    if (user.role.includes(role)) {
      return apiResponse({
        res,
        status: false,
        message: `This user already has the role '${role}'.`,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    user.role = [...new Set([...user.role, role])];

    await user.save();

    const { password, otp, otpExpiresAt, ...safeUser } = user.toObject();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.ASSIGN_ROLE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: `Role '${role}' of this user ${userId} assigned successfully.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: `Role '${role}' has been assigned successfully.`,
      data: safeUser,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.ASSIGN_ROLE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to assign role. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      message: "Unable to assign role. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

// -------------------------------
// Remove Role From User (Admin)
// -------------------------------
// Removes a specific role from a user, ensuring at least one role remains.
// Logs the action for audit purposes and returns updated user info.
const removeRoleFromUser = async (req, res) => {
  try {
    const { userId, role } = req.body;

    const user = await UserModel.findOne({ _id: userId, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    if (!user.role.includes(role)) {
      return apiResponse({
        res,
        status: false,
        message: `This user does not have the role '${role}'.`,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (user.role.length === 1) {
      return apiResponse({
        res,
        status: false,
        message: "User must have at least one role.",
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    user.role = user.role.filter((r) => r !== role);
    await user.save();

    const { password, otp, otpExpiresAt, secretKey, ...safeUser } =
      user.toObject();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.REMOVE_ROLE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: `Role '${role}' of this user ${userId} removed successfully.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: `Role '${role}' has been removed successfully.`,
      data: safeUser,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.REMOVE_ROLE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to remove role. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Unable to remove role. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      error: error.message,
    });
  }
};

// -------------------------------
// Get Medicine Usage (Admin)
// -------------------------------
// Calculates and returns the number of times medicines have been taken,
// for a specific user or all users. Includes usage percentage and paginated results.
const getMedicineUsageByAdmin = async (req, res) => {
  try {
    const { userId, page = 1, limit = 10 } = req.query;
    const filter = userId ? { userId } : {};

    const schedules = await MedicineScheduleModel.find(filter)
      .populate("medicineName", "medicineName")
      .lean();

    const usageMap = new Map();

    schedules.forEach((schedule) => {
      const medName = schedule.medicineName?.medicineName || "Unknown";
      let takenCount = 0;

      schedule.doseLogs?.forEach((day) => {
        day.doses?.forEach((dose) => {
          if (dose.status === enumConfig.scheduleStatusEnums.TAKEN) {
            takenCount++;
          }
        });
      });

      if (takenCount > 0) {
        usageMap.set(medName, (usageMap.get(medName) || 0) + takenCount);
      }
    });

    // Convert to array
    let usageArray = Array.from(usageMap.entries()).map(
      ([medicineName, takenCount]) => ({
        medicineName,
        takenCount,
      })
    );

    // Sort descending
    usageArray.sort((a, b) => b.takenCount - a.takenCount);

    // Max taken for percentage
    const maxTaken = Math.max(...usageArray.map((item) => item.takenCount), 0);

    const usageWithPercentage = usageArray.map((item) => ({
      ...item,
      usagePercentage:
        maxTaken > 0
          ? ((item.takenCount / maxTaken) * 100).toFixed(2) + "%"
          : "0.00%",
    }));

    // Apply pagination
    const { skip, limit: parsedLimit } = helper.paginationFun({ page, limit });
    const paginatedData = usageWithPercentage.slice(skip, skip + parsedLimit);

    const pagination = helper.paginationDetails({
      page,
      totalItems: usageWithPercentage.length,
      limit: parsedLimit,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_MEDICINE_USAGES,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: userId
        ? "User's medicine usage fetched successfully."
        : "Top used medicines across all users fetched successfully.",
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      data: paginatedData,
      pagination,
      message: userId
        ? "User's medicine usage fetched successfully."
        : "Top used medicines across all users fetched successfully.",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_MEDICINE_USAGES,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message ||
        "Unable to fetch medicine usage. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Unable to fetch medicine usage. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// -------------------------------
// Get Vaccine Usage (Admin)
// -------------------------------
// Calculates and returns vaccine usage for a specific user or all users.
// Includes usage percentage and paginated results.
const getVaccineUsageByAdmin = async (req, res) => {
  try {
    const { userId, page = 1, limit = 10 } = req.query;
    const filter = userId ? { scheduleBy: userId } : {};

    const schedules = await VaccineSchedule.find(filter)
      .populate("vaccineId", "vaccineName")
      .lean();

    if (!schedules.length) {
      return apiResponse({
        res,
        status: true,
        data: [],
        pagination: helper.paginationDetails({ page, totalItems: 0, limit }),
        message: "No vaccine usage data found.",
        statusCode: StatusCodes.OK,
      });
    }

    const usageMap = new Map();

    for (const schedule of schedules) {
      const vaccineName = schedule.vaccineId?.vaccineName || "Unknown";

      if (schedule.scheduleStatus === enumConfig.scheduleStatusEnums.TAKEN) {
        usageMap.set(vaccineName, (usageMap.get(vaccineName) || 0) + 1);
      }
    }

    const usageData = Array.from(usageMap.entries()).map(
      ([vaccineName, takenCount]) => ({
        vaccineName,
        takenCount,
      })
    );

    const maxTaken = Math.max(...usageData.map((item) => item.takenCount), 0);

    const finalData = usageData.map((item) => ({
      ...item,
      usagePercentage:
        maxTaken > 0
          ? ((item.takenCount / maxTaken) * 100).toFixed(2) + "%"
          : "0.00%",
    }));

    finalData.sort((a, b) => b.takenCount - a.takenCount);

    const { skip, limit: parsedLimit } = helper.paginationFun({ page, limit });
    const paginatedData = finalData.slice(skip, skip + parsedLimit);

    const pagination = helper.paginationDetails({
      page,
      totalItems: finalData.length,
      limit: parsedLimit,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_VACCINE_USAGES,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: userId
        ? "User's vaccine usage fetched successfully."
        : "Vaccine usage for all users fetched successfully.",
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      data: paginatedData,
      pagination,
      message: userId
        ? "User's vaccine usage fetched successfully."
        : "Vaccine usage for all users fetched successfully.",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_VACCINE_USAGES,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message ||
        "Unable to fetch vaccine usage. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Unable to fetch vaccine usage. Please try again later.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// -------------------------------
// Create Supplement Tag (Admin)
// -------------------------------
// Adds a new supplement tag created by the admin. Checks for duplicates,
// logs the action, and returns the created tag.
const createSupplementTagByAdmin = async (req, res) => {
  try {
    const data = req.body;
    data.createdBy = req.user.id;

    const existing = await SupplementTag.findOne({
      name: new RegExp(`^${data.name}$`, "i"),
      createdBy: req.user.id,
    });

    if (existing) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.CONFLICT,
        message: "A tag with this name already exists.",
      });
    }

    const tag = await SupplementTag.create(data);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CREATE_SUPPLEMENT_TAG,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.CREATE_SUPPLEMENT_TAG,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: "Tag created successfully.",
      data: tag,
    });
  } catch (error) {
    console.error("Error in createTag:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CREATE_SUPPLEMENT_TAG,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to create tag. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Unable to create tag. Please try again later.",
    });
  }
};

// -------------------------------
// Get All Supplement Tags (Admin)
// -------------------------------
// Fetches all supplement tags with optional filters (active status, ID),
// supports pagination, and includes creator details.
const getAllSupplementTagsByAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, active } = req.query;
    const { id } = req.params;

    const filter = {};

    filter.isDeleted = false;
    if (active !== undefined) {
      filter.active = active === "true";
    }

    if (id) filter._id = new mongoose.Types.ObjectId(id);

    // Count total matching documents
    const totalItems = await SupplementTag.countDocuments(filter);

    // Calculate pagination offsets
    const { skip, limit: parsedLimit } = helper.paginationFun({ page, limit });

    // Fetch paginated tags
    const tags = await SupplementTag.find(filter)
      .populate("createdBy", "fullName email profileImage")
      .skip(skip)
      .limit(parsedLimit)
      .sort({ createdAt: -1 })
      .lean();

    const pagination = helper.paginationDetails({
      page,
      totalItems,
      limit: parsedLimit,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_SUPPLEMENT_TAGS,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_SUPPLEMENT_TAGS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Tags fetched successfully.",
      data: tags,
      pagination,
    });
  } catch (error) {
    console.error("Error in getAllSupplementTagsByAdmin:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_SUPPLEMENT_TAGS,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to fetch tags. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Unable to fetch tags. Please try again later.",
    });
  }
};

// -------------------------------
// Update Supplement Tag (Admin)
// -------------------------------
// Updates an existing supplement tag’s fields,
// including name, category, color, and active status. Prevents duplicate names.
const updateSupplementTagByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, color, active, description } = req.body;

    const tag = await SupplementTag.findById(id);
    if (!tag) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Tag not found.",
        data: null,
      });
    }

    // Generate new slug from updated name (if name is changing)
    let newSlug;
    if (name) {
      newSlug = slugify(name, { lower: true, strict: true });

      // Check for duplicate slug excluding current document
      const existing = await SupplementTag.findOne({
        slug: newSlug,
        _id: { $ne: id },
      });

      if (existing) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.CONFLICT,
          message: "A tag with this name already exists.",
        });
      }
    }

    // Prepare update object
    const updateObj = {};
    if (name) updateObj.name = name;
    if (description) updateObj.description = description;
    if (name) updateObj.slug = newSlug;
    if (category !== undefined) updateObj.category = category;
    if (color !== undefined) updateObj.color = color;
    if (active !== undefined) updateObj.active = active;

    const updatedTag = await SupplementTag.findByIdAndUpdate(id, updateObj, {
      new: true,
      runValidators: true,
    });

    if (!updatedTag) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Tag not found.",
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.UPDATE_SUPPLEMENT_TAGS,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.UPDATE_SUPPLEMENT_TAGS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Tag updated successfully.",
      data: updatedTag,
    });
  } catch (error) {
    console.error("Error in updateTagById:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.UPDATE_SUPPLEMENT_TAGS,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to update tag. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Unable to update tag. Please try again later.",
    });
  }
};

// -------------------------------
// Delete Supplement Tag (Admin)
// -------------------------------
// Soft deletes or permanently deletes a supplement tag based on request.
// Logs the action and returns success status.
const deleteSupplementTagByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPermanentDelete } = req.body;

    const deletedTag = await SupplementTag.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!deletedTag) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Tag not found.",
      });
    }

    if (isPermanentDelete === false) {
      deletedTag.isDeleted = true;
      await deletedTag.save();
    } else if (isPermanentDelete === true) {
      const result = await SupplementTag.deleteOne({
        _id: id,
        isDeleted: false,
      });
      if (result.deletedCount === 0) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.NOT_FOUND,
          message: "Tag not found or already deleted.",
        });
      }
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.DELETE_SUPPLEMENT_TAG,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.DELETE_SUPPLEMENT_TAG,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Tag is deleted successfully.",
    });
  } catch (error) {
    console.error("Error in deleteTagById:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.DELETE_SUPPLEMENT_TAG,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message || "Unable to delete tag. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Unable to delete tag. Please try again later.",
    });
  }
};

// -------------------------------
// List Feature Flags (Admin)
// -------------------------------
// Returns all feature flags configured in the system along with status.
// Logs the action for auditing.
const listFeatureFlags = async (req, res) => {
  try {
    const flags = await featureFlags.listFlags();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_FEATURED_FLAGS,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_FEATURED_FLAGS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Feature flags fetched successfully.",
      data: flags,
    });
  } catch (error) {
    console.log("Error in listFeatureFlags:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_FEATURED_FLAGS,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description:
        error.message ||
        "Unable to fetch feature flags. Please try again later.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Unable to fetch feature flags. Please try again later.",
      error: error.message,
    });
  }
};

// -------------------------------
// Set / Update Feature Flag (Admin)
// -------------------------------
// Updates or sets a specific feature flag’s value and description.
// Logs the action for auditing purposes.
const setFeatureFlag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { key, value, description } = req.body;

    await featureFlags.setFlag(key, value, description, userId);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.UPDATE_FEATURED_FLAG,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.UPDATE_FEATURED_FLAG,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: `Feature flag '${key}' updated to ${value}.`,
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.UPDATE_FEATURED_FLAG,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to update feature flag.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to update feature flag.",
      error: error.message,
    });
  }
};

// -------------------------------
// Enable / Disable Feature Flag (Admin)
// -------------------------------
// Updates the value of an existing feature flag (on/off).
// Validates the flag exists and logs the update.
const enableDisableFlag = async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;

    const isExisting = await FeatureFlagModel.findById(id);
    if (!isExisting) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Flag not found.",
      });
    }

    await FeatureFlagModel.findByIdAndUpdate(
      id,
      { $set: { value: value } },
      { new: true }
    );

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: `Flag updated successfully.`,
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Unable to update feature flag. Please try again later.",
      error: error.message,
    });
  }
};

// -------------------------------
// Block / Unblock Caregiver (Admin)
// -------------------------------
// Updates the block status of a caregiver user.
// Validates the user is a caregiver and logs the action.
const blockUnblockCaregiverByAdmin = async (req, res) => {
  try {
    const { caregiverId, is_caregiver_block } = req.body;

    if (!mongoose.Types.ObjectId.isValid(caregiverId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid caregiver ID provided.",
      });
    }

    const caregiver = await UserModel.findById(caregiverId);
    if (!caregiver) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Caregiver not found.",
      });
    }

    const roles = Array.isArray(caregiver.role)
      ? caregiver.role
      : [caregiver.role];
    if (!roles.includes(enumConfig.userRoleEnum.CAREGIVER)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "The selected user is not a caregiver.",
      });
    }

    caregiver.is_caregiver_block = is_caregiver_block;
    await caregiver.save();

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: `Caregiver has been ${
        is_caregiver_block ? "blocked" : "unblocked"
      } successfully.`,
      data: null,
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Unable to update caregiver status. Please try again later.",
      error: error.message,
    });
  }
};

// -------------------------------
// Generate Monthly Medicine Schedule Report
// -------------------------------
// Aggregates medicine dose logs for a user for the current month,
// calculates weekly and total adherence percentages.
const generateMonthlyScheduleReport = async (userId, date = new Date()) => {
  const year = date.getUTCFullYear();
  const month1based = date.getUTCMonth() + 1;
  const month0 = month1based - 1;

  const monthStart = new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59, 999));

  const TAKEN_SET = new Set(
    [
      enumConfig?.scheduleStatusEnums?.TAKEN,
      enumConfig?.scheduleStatusEnums?.COMPLETED,
      enumConfig?.scheduleStatusEnums?.DONE,
      "TAKEN",
      "COMPLETED",
      "DONE",
    ].filter(Boolean)
  );

  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const weekRange = (w) => {
    const startDay = (w - 1) * 7 + 1;
    const endDay = Math.min(startDay + 6, lastDay);
    return {
      start: new Date(Date.UTC(year, month0, startDay, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month0, endDay, 23, 59, 59, 999)),
    };
  };
  const weekOfMonth = (date) =>
    Math.min(5, Math.ceil(new Date(date).getUTCDate() / 7));

  const weekStats = {
    1: { taken: 0, total: 0 },
    2: { taken: 0, total: 0 },
    3: { taken: 0, total: 0 },
    4: { taken: 0, total: 0 },
    5: { taken: 0, total: 0 },
  };

  const schedules = await MedicineScheduleModel.find({
    userId,
    $or: [
      {
        $and: [
          { startDate: { $lte: monthEnd } },
          { endDate: { $gte: monthStart } },
        ],
      },
      {
        $and: [
          { startDate: { $lte: monthEnd } },
          { endDate: { $exists: false } },
        ],
      },
      {
        $and: [
          { startDate: { $exists: false } },
          { endDate: { $exists: false } },
        ],
      },
    ],
  })
    .select("doseLogs medicineName dosage totalDosesPerDay")
    .lean();

  for (const sch of schedules) {
    const logs = Array.isArray(sch.doseLogs) ? sch.doseLogs : [];
    for (const daily of logs) {
      const d = daily?.date;
      if (!d) continue;
      const dt = new Date(d);
      if (dt < monthStart || dt > monthEnd) continue;
      const wb = weekOfMonth(dt);
      const entries = Array.isArray(daily.doses) ? daily.doses : [];
      weekStats[wb].total += entries.length;
      for (const e of entries) {
        const statusVal = e?.status;
        if (statusVal && TAKEN_SET.has(statusVal)) {
          weekStats[wb].taken += 1;
        }
      }
    }
  }

  const toPercent = (t, n) => (n > 0 ? Math.round((t / n) * 100) : 0);
  const weeks = [1, 2, 3, 4, 5].map((w) => {
    const r = weekRange(w);
    const { taken, total } = weekStats[w];
    return {
      week: `${w} Week`,
      startDate: r.start.toISOString(),
      endDate: r.end.toISOString(),
      taken,
      total,
      adherencePercent: toPercent(taken, total),
    };
  });

  const totals = Object.values(weekStats).reduce(
    (acc, w) => ({ taken: acc.taken + w.taken, total: acc.total + w.total }),
    { taken: 0, total: 0 }
  );

  return {
    month: `${year}-${String(month1based).padStart(2, "0")}`,
    range: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
    overview: {
      totalTaken: totals.taken,
      totalDoses: totals.total,
      adherencePercent: toPercent(totals.taken, totals.total),
    },
    weeks,
  };
};

// -------------------------------
// Get User Dashboard
// -------------------------------
// Aggregates all user-related data for the dashboard view,
// including health data, onboarding info, medicine/vaccine schedules,
// appointments, supplements, monthly report, weather, and mental health score.
const getUserDashboard = async (req, res) => {
  try {
    const loginUserId = req.params.userId;

    const isExist = await UserModel.findById(loginUserId);
    if (!isExist) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "User not found.",
      });
    }

    const todayStart = moment().startOf("day").toDate();
    const todayEnd = moment().endOf("day").toDate();
    const OPENWEATHER_BASE_URL =
      "https://api.openweathermap.org/data/2.5/weather";

    const [
      userInfo,
      healthData,
      onboardData,
      medicineSchedule,
      vaccineSchedule,
      appointmentSchedule,
      supplements,
      monthlyScheduleReport,
      mentalHealthScore,
    ] = await Promise.all([
      UserModel.findOne({
        _id: loginUserId,
        is_verified: true,
        is_deleted: false,
      }).select("email fullName profileImage role is_caregiver_block"),
      HealthGoalModel.findOne({ userId: loginUserId }).select(
        "-_id -userId -createdAt -updatedAt"
      ),
      Onboarding.findOne({ userId: loginUserId }).select(
        "-_id -userId -createdAt -updatedAt -__v -perspective"
      ),
      MedicineScheduleModel.find({
        userId: loginUserId,
        startDate: { $lte: todayEnd },
        endDate: { $gte: todayStart },
      }).populate("medicineName", "medicineName dosage"),
      VaccineSchedule.find({
        scheduleBy: loginUserId,
        date: { $gte: todayStart, $lte: todayEnd },
      }).populate("vaccineId", "vaccineName provider"),
      Telemedicine.find({
        userId: loginUserId,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
      }).populate("doctorId", "fullName profileImage"),
      SupplementModel.find()
        .populate("ingredients", "name categories description")
        .populate("tags", "name category color")
        .sort({ createdAt: -1 })
        .limit(5),
      generateMonthlyScheduleReport(loginUserId),
      MentalHealth.find({ userId: loginUserId }).select(
        "advice level percentage"
      ),
    ]);

    // ✅ Fetch weather using onboarding city
    let weatherData = null;
    try {
      if (onboardData?.city && process.env.OPENWEATHER_API_KEY) {
        const owRes = await axios.get(OPENWEATHER_BASE_URL, {
          params: {
            appid: process.env.OPENWEATHER_API_KEY,
            q: onboardData.city,
            units: "metric",
            lang: "en",
          },
          timeout: 10000,
        });
        const d = owRes.data;
        weatherData = {
          location: {
            name: d?.name ?? null,
            country: d?.sys?.country ?? null,
            coord: d?.coord ?? null,
            timezoneOffsetSec: d?.timezone ?? null,
            query: onboardData.city,
          },
          weather: {
            main: d?.weather?.[0]?.main ?? null,
            description: d?.weather?.[0]?.description ?? null,
            icon: d?.weather?.[0]?.icon ?? null,
          },
          temperature: {
            current: d?.main?.temp ?? null,
            feels_like: d?.main?.feels_like ?? null,
            min: d?.main?.temp_min ?? null,
            max: d?.main?.temp_max ?? null,
            humidity: d?.main?.humidity ?? null,
            pressure: d?.main?.pressure ?? null,
          },
          wind: {
            speed: d?.wind?.speed ?? null,
            deg: d?.wind?.deg ?? null,
            gust: d?.wind?.gust ?? null,
          },
          cloudsPercent: d?.clouds?.all ?? null,
          visibility: d?.visibility ?? null,
          sunrise: d?.sys?.sunrise
            ? new Date(d.sys.sunrise * 1000).toISOString()
            : null,
          sunset: d?.sys?.sunset
            ? new Date(d.sys.sunset * 1000).toISOString()
            : null,
        };
      }
    } catch (err) {
      console.log("Weather fetch failed:", err?.message || err);
      weatherData = null;
    }

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Dashboard loaded successfully",
      data: {
        userInfo,
        healthData,
        onboardData,
        medicineSchedule,
        vaccineSchedule,
        appointmentSchedule,
        supplements,
        monthlyScheduleReport,
        weather: weatherData,
        mentalHealthScore: mentalHealthScore[0] || null,
      },
    });
  } catch (error) {
    console.log(error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Unable to load dashboard data. Please try again later.",
      data: null,
    });
  }
};

export default {
  getAllUserProfile,
  blockAndUnblockUserProfile,
  getUserMedicineSchedules,
  getUserVaccineSchedules,
  getDoctorAvailability,
  getTelemedicineAppointments,
  assignRoleToUser,
  removeRoleFromUser,
  getMedicineUsageByAdmin,
  getVaccineUsageByAdmin,
  createSupplementTagByAdmin,
  getAllSupplementTagsByAdmin,
  updateSupplementTagByAdmin,
  deleteSupplementTagByAdmin,
  listFeatureFlags,
  setFeatureFlag,
  enableDisableFlag,
  blockUnblockCaregiverByAdmin,
  getUserDashboard,
};
