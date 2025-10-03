import moment from "moment";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import DoctorAvailability from "../models/availability.model.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";

// -----------------------------
// Get Doctor Availability
// -----------------------------
// Fetches the doctor's availability details based on the provided doctor ID (if available).
const getAvailability = async (req, res) => {
  try {
    const filter = {};
    const { doctor } = req.query;

    if (doctor) {
      if (!mongoose.Types.ObjectId.isValid(doctor)) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Invalid doctor ID.",
        });
      }
      filter.doctorId = new mongoose.Types.ObjectId(doctor);
    }

    const fetchAvailability = await DoctorAvailability.find(filter)
      .populate(
        "doctorId",
        "email fullName profileImage role experience phoneNumber description specialization qualifications"
      )
      .sort({ createdAt: -1 });

    if (fetchAvailability.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Doctor Availability not found.",
        data: null,
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.AVAILABILITY,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.AVAILABILITY,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: fetchAvailability,
      message: "Doctor Availability fetch successfully.",
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.AVAILABILITY,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to fetch doctor availability.",
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

// -----------------------------
// Update Doctor Availability
// -----------------------------
// Updates the availability details for a specific doctor by validating the provided data.
const updateAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid availability ID",
      });
    }

    const findAvailability = await DoctorAvailability.findById(id);
    if (!findAvailability) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Doctor Availability not found.",
      });
    }

    if (Array.isArray(data?.availability)) {
      const daysSet = new Set();

      for (const dayAvailability of data?.availability) {
        if (!dayAvailability.day) {
          return apiResponse({
            res,
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Each availability must have a day specified.",
          });
        }

        if (daysSet.has(dayAvailability?.day)) {
          return apiResponse({
            res,
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Duplicate day '${dayAvailability?.day}' found in availability. Each day must be unique.`,
          });
        }

        daysSet.add(dayAvailability?.day);

        if (Array.isArray(dayAvailability?.shift)) {
          for (const slot of dayAvailability?.shift) {
            const startTime = moment(slot.startTime, "hh:mm A", true);
            const endTime = moment(slot.endTime, "hh:mm A", true);

            if (!startTime.isValid() || !endTime.isValid()) {
              return apiResponse({
                res,
                status: false,
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Invalid time format in availability for day '${dayAvailability.day}'. Please use 'hh:mm AM/PM' format.`,
              });
            }
          }
        }
      }
    }

    const result = await DoctorAvailability.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.UPDATE_AVAILABILITY,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.UPDATE_AVAILABILITY,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Doctor Availability updated successfully.",
      data: result,
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.UPDATE_AVAILABILITY,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to update doctor availability.",
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

export default {
  updateAvailability,
  getAvailability,
};
