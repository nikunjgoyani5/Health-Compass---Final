import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import fileUploadService from "../services/file.upload.service.js";
import Telemedicine from "../models/telemedicine.model.js";
import helper from "../helper/common.helper.js";
import userService from "../services/user.service.js";
import emailService from "../services/email.service.js";
import enumConfig from "../config/enum.config.js";
import UserModel from "../models/user.model.js";
import DoctorAvailability from "../models/availability.model.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";

// --- add doctor by admin ---
const addDoctor = async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      experience,
      description,
      specialization,
    } = req.body;
    const profileImage = req.file;
    let fileKey = null;

    if (profileImage) {
      fileKey = await fileUploadService.uploadFile({
        buffer: profileImage.buffer,
        mimetype: profileImage.mimetype,
      });
    }

    const doctor = await UserModel.findOne({
      email,
      role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
      is_verified: true,
      is_deleted: false,
      experience,
      specialization,
    });

    if (doctor) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "This doctor is already exist.",
      });
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const newUser = {
      email,
      password: hashPassword,
      provider: enumConfig.authProviderEnum.EMAIL,
      otp: null,
      otpExpiresAt: null,
      fullName,
      role: enumConfig.userRoleEnum.DOCTOR,
      inviteCode: await helper.generateInviteCode(),
      is_verified: true,
      is_deleted: false,
      otpVerified: true,
      expiresIn: null,
      specialization,
      profileImage: fileKey,
      description,
      experience,
    };

    await emailService.sendDoctorCredentialsEmail({
      email,
      fullName,
      password,
    });
    const createdDoctor = await userService.create(newUser);

    const defaultAvailability = [
      ...[
        enumConfig.doctorAvailabilityEnums.MONDAY,
        enumConfig.doctorAvailabilityEnums.TUESDAY,
        enumConfig.doctorAvailabilityEnums.WEDNESDAY,
        enumConfig.doctorAvailabilityEnums.THURSDAY,
        enumConfig.doctorAvailabilityEnums.FRIDAY,
      ].map((day) => ({
        day,
        shift: [
          { startTime: "09:00 AM", endTime: "10:00 AM" },
          { startTime: "10:00 AM", endTime: "11:00 AM" },
          { startTime: "11:00 AM", endTime: "12:00 AM" },
          { startTime: "12:00 AM", endTime: "01:00 PM" },

          { startTime: "02:00 PM", endTime: "03:00 PM" },
          { startTime: "03:00 PM", endTime: "04:00 PM" },
          { startTime: "04:00 PM", endTime: "05:00 PM" },
          { startTime: "05:00 PM", endTime: "06:00 PM" },
          { startTime: "06:00 PM", endTime: "07:00 PM" },
          { startTime: "07:00 PM", endTime: "08:00 PM" },
          { startTime: "08:00 PM", endTime: "09:00 PM" },
        ],
      })),
      {
        day: enumConfig.doctorAvailabilityEnums.SATURDAY,
        shift: [
          { startTime: "09:00 AM", endTime: "10:00 AM" },
          { startTime: "10:00 AM", endTime: "11:00 AM" },
          { startTime: "11:00 AM", endTime: "12:00 AM" },
          { startTime: "12:00 AM", endTime: "01:00 PM" },

          { startTime: "02:00 PM", endTime: "03:00 PM" },
          { startTime: "03:00 PM", endTime: "04:00 PM" },
          { startTime: "04:00 PM", endTime: "05:00 PM" },
          { startTime: "05:00 PM", endTime: "06:00 PM" },
        ],
      },
      {
        day: enumConfig.doctorAvailabilityEnums.SUNDAY,
        shift: [
          { startTime: "09:00 AM", endTime: "10:00 AM" },
          { startTime: "10:00 AM", endTime: "11:00 AM" },
          { startTime: "11:00 AM", endTime: "12:00 AM" },
          { startTime: "12:00 AM", endTime: "01:00 PM" },
        ],
      },
    ];

    await DoctorAvailability.create({
      doctorId: createdDoctor._id,
      availability: defaultAvailability,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.CREATE_ACCOUNT,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: activityDescriptions.DOCTOR.CREATE_ACCOUNT,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      status: true,
      message:
        "Doctor account created successfully. Login credentials have been sent to the registered email.",
      data: null,
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.CREATE_ACCOUNT,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: error.message || "Failed to create doctor account.",
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

// --- get list of doctors ---
const getDoctorDetail = async (req, res) => {
  try {
    const filter = {};

    const { fullName, specialization, id } = req.query;

    if (id) filter._id = new mongoose.Types.ObjectId(id);
    if (fullName) filter.fullName = { $regex: fullName, $options: "i" };
    filter.role = { $in: [enumConfig.userRoleEnum.DOCTOR] };
    filter.is_deleted = false;

    if (specialization)
      filter.specialization = {
        $elemMatch: { $regex: specialization, $options: "i" },
      };

    const pagination = helper.paginationFun(req.query);

    const doctors = await UserModel.find(filter)
      .select(
        "inviteCode email fullName profileImage providerId provider role experience phoneNumber qualifications specialization description"
      )
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 });

    let count = await UserModel.countDocuments(filter);
    let paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: count,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.GET_LIST,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: activityDescriptions.DOCTOR.GET_LIST,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Doctor detail fetched successfully.",
      pagination: paginationData,
      data: doctors,
    });
  } catch (error) {
    console.error("Error fetching doctor detail:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.GET_LIST,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: error.message || "Failed to fetch doctor account.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Failed to fetch doctor detail",
    });
  }
};

// --- update doctor ---
const updateDoctorDetail = async (req, res) => {
  try {
    const file = req.file;
    const rawData = { ...req.body };
    const doctorId = req.params.id;

    const doctor = await UserModel.findOne({
      _id: doctorId,
      is_deleted: false,
      role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
    });

    if (!doctor) {
      return apiResponse({
        res,
        statusCode: StatusCodes.NOT_FOUND,
        status: false,
        message: "Doctor not found.",
      });
    }

    const data = {};
    for (const key in rawData) {
      if (typeof rawData[key] === "string") {
        try {
          data[key] = JSON.parse(rawData[key]);
        } catch {
          data[key] = rawData[key];
        }
      } else {
        data[key] = rawData[key];
      }
    }

    if (file) {
      const fileKey = await fileUploadService.uploadFile({
        buffer: file.buffer,
        mimetype: file.mimetype,
      });
      data.profileImage = fileKey;
    }

    const result = await UserModel.findByIdAndUpdate(
      doctorId,
      { $set: data },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.UPDATE_ACCOUNT,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: activityDescriptions.DOCTOR.UPDATE_ACCOUNT,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Doctor detail updated successfully.",
      data: null,
    });
  } catch (error) {
    console.error("Error updating doctor detail:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.UPDATE_ACCOUNT,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: error.message || "Failed to update doctor account.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Failed to update doctor detail",
    });
  }
};

// --- get appointments by doctorId ---
const getAppointmentsByDoctorId = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const doctor = await UserModel.findOne({
      _id: doctorId,
      is_deleted: false,
      role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
    });
    if (!doctor) {
      return apiResponse({
        res,
        statusCode: StatusCodes.NOT_FOUND,
        status: false,
        message: "Doctor not found.",
      });
    }

    const appointments = await Telemedicine.find({ doctorId })
      .populate("userId", "fullName profileImage")
      .populate("doctorId", "fullName profileImage")
      .sort({ createdAt: -1 });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.GET_APPOINTMENT,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: activityDescriptions.DOCTOR.GET_APPOINTMENT,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Appointments fetched successfully.",
      data: appointments,
    });
  } catch (error) {
    console.error("Error fetching appointments:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DOCTOR.GET_APPOINTMENT,
      activityCategory: enumConfig.activityCategoryEnum.DOCTOR,
      description: error.message || "Failed to fetch appointments.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Failed to fetch appointments",
    });
  }
};

export default {
  addDoctor,
  getDoctorDetail,
  updateDoctorDetail,
  getAppointmentsByDoctorId,
};
