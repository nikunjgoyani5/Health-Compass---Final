import { StatusCodes } from "http-status-codes";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import { apiResponse } from "../helper/api-response.helper.js";
import enumConfig from "../config/enum.config.js";
import caregiverAccessUser from "../middleware/caregiver-access.middleware.js";
import VaccineModel from "../models/vaccine.model.js";
import commonHelper from "../helper/common.helper.js";
import moment from "moment";
import activityDescriptions from "../config/activity-description.config.js";
import activityLogService from "../services/activity-log.service.js";

// --- schedule vaccine ---
const scheduleVaccine = async (req, res) => {
  try {
    console.log("📥 Incoming Request Body:", req.body);
    console.log("🧑‍💼 Authenticated User:", req.user);
    const { vaccineId, date, doseTime } = req.body;

    const isFutureDateTime = commonHelper.validateFutureDateTime(
      date,
      doseTime
    );
    if (isFutureDateTime) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Please select a valid future date and time.",
      });
    }

    const findVaccine = await VaccineModel.findById(vaccineId);
    if (!findVaccine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine not found.",
      });
    }

    const findSchedule = await VaccineSchedule.findOne({
      vaccineId,
      scheduleBy: req.user._id,
      date,
      doseTime,
      scheduleStatus: enumConfig.scheduleStatusEnums.PENDING,
    });

    if (findSchedule) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine is already schedule by this user.",
      });
    }

    const newSchedule = {
      vaccineId,
      scheduleBy: req.user._id,
      date,
      doseTime,
      scheduleStatus: enumConfig.scheduleStatusEnums.PENDING,
    };

    const vaccineSchedule = await VaccineSchedule.create(newSchedule);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: activityDescriptions.VACCINE_SCHEDULE.SCHEDULE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      data: vaccineSchedule,
      message: "Vaccine schedule successfully.",
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Failed to schedule vaccine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

// --- get vaccine schedule ---
const getVaccineSchedule = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const targetUserId = req.params.userId || req.query.userId || requesterId;

    console.log("🔍 Requester ID:", requesterId);
    console.log("🎯 Target User ID:", targetUserId);

    const hasAccess = await caregiverAccessUser(requesterId, targetUserId);
    console.log("🔐 Caregiver Access Granted:", hasAccess);

    if (!hasAccess) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "Access denied. You are not authorized to view this data.",
      });
    }

    const filter = { scheduleBy: targetUserId };

    const vaccineSchedule = await VaccineSchedule.find(filter)
      .populate("vaccineId", "vaccineName provider")
      .populate("scheduleBy", "fullName email profileImage")
      .sort({ createdAt: -1 });

    if (!vaccineSchedule || vaccineSchedule.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine schedule not found.",
      });
    }

    console.log("💉 Vaccine Schedule Count:", vaccineSchedule.length);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.GET,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: activityDescriptions.VACCINE_SCHEDULE.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: vaccineSchedule,
      message: "Vaccine schedule retrieved successfully.",
    });
  } catch (error) {
    console.error("❌ Error fetching vaccine schedule:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.GET,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Failed to get vaccine schedule.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

// --- update schedule status ---
const updateScheduleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduleStatus } = req.body;

    const vaccine = await VaccineSchedule.findById(id);
    if (!vaccine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine not found.",
      });
    }

    if (vaccine.scheduleStatus === enumConfig.scheduleStatusEnums.MISSED) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "This dose was missed. Please ensure to take it at the next scheduled time.",
        status: false,
        data: null,
      });
    } else if (
      vaccine.scheduleStatus === enumConfig.scheduleStatusEnums.TAKEN
    ) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "This dose has already been taken. You cannot update the status again.",
        status: false,
        data: null,
      });
    }

    vaccine.scheduleStatus = scheduleStatus;
    await vaccine.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.UPDATE_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: activityDescriptions.VACCINE_SCHEDULE.UPDATE_STATUS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: vaccine,
      message: "Schedule status updated successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.UPDATE_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Failed to update vaccine schedule status.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
    });
  }
};

// --- delete vaccine schedule ---
const deleteVaccineSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const vaccineSchedule = await VaccineSchedule.findById(id);
    if (!vaccineSchedule) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Vaccine schedule not found.",
      });
    }

    await VaccineSchedule.findByIdAndDelete(id);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: activityDescriptions.VACCINE_SCHEDULE.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: null,
      message: "Vaccine schedule deleted successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Failed to delete vaccine schedule.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Failed to delete vaccine schedule.",
    });
  }
};

// --- update vaccine schedule ---
const updateVaccineSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const vaccineSchedule = await VaccineSchedule.findById(id);
    if (!vaccineSchedule) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Vaccine schedule not found.",
      });
    }

    if (String(vaccineSchedule.scheduleBy) !== String(req.user._id)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.UNAUTHORIZED,
        data: null,
        message: "You are not authorized to update this schedule.",
      });
    }

    // Validate future date and time if provided
    const dateToCheck = data.date || vaccineSchedule.date;
    const doseTimeToCheck = data.doseTime || vaccineSchedule.doseTime;

    const isFutureDateTime = commonHelper.validateFutureDateTime(
      dateToCheck,
      doseTimeToCheck
    );
    if (isFutureDateTime) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Please select a valid future date and time.",
      });
    }

    const checkFields = ["vaccineId", "date", "doseTime"];
    const isRelevantFieldChanged = checkFields.some(
      (field) => data[field] && data[field] !== vaccineSchedule[field]
    );

    if (isRelevantFieldChanged) {
      const findSchedule = await VaccineSchedule.findOne({
        vaccineId: data.vaccineId || vaccineSchedule.vaccineId,
        scheduleBy: vaccineSchedule.scheduleBy,
        date: dateToCheck,
        doseTime: doseTimeToCheck,
        scheduleStatus: enumConfig.scheduleStatusEnums.PENDING,
        _id: { $ne: id },
      });

      if (findSchedule) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          data: null,
          message:
            "A schedule with the same vaccine, date, and time already exists.",
        });
      }
    }

    const updatedVaccineSchedule = await VaccineSchedule.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: activityDescriptions.VACCINE_SCHEDULE.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: updatedVaccineSchedule,
      message: "Vaccine schedule updated successfully.",
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Failed to update vaccine schedule.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

const getVaccineScheduleByDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return apiResponse({
        res,
        status: false,
        statusCode: 400,
        message: "Query param 'date' is required in YYYY-MM-DD format.",
      });
    }

    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const filter = {
      scheduleBy: req.user._id,
      date: { $gte: start, $lt: end },
    };

    let schedules = await VaccineSchedule.find(filter)
      .populate("vaccineId", "vaccineName provider")
      .populate("scheduleBy", "fullName email profileImage")
      .lean();

    // ✅ Sort schedules by doseTime (e.g. 09:45 AM, 10:30 PM)
    schedules.sort((a, b) => {
      const timeA = moment(a.doseTime, ["hh:mm A"]).toDate();
      const timeB = moment(b.doseTime, ["hh:mm A"]).toDate();
      return timeA - timeB;
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.GET,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: activityDescriptions.VACCINE_SCHEDULE.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: 200,
      data: schedules,
      message: "Vaccine schedule fetched successfully for selected date.",
    });
  } catch (error) {
    console.error("❌ Error fetching vaccine schedule by date:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.GET,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Error fetching vaccine schedule by date.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error.",
    });
  }
};

const scheduleVaccineByBot = async (req, res) => {
  try {
    const { vaccineName, date, doseTime } = req.body;

    const findVaccine = await VaccineModel.findOne({
      vaccineName: vaccineName,
    });
    if (!findVaccine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine not found.",
      });
    }

    const findSchedule = await VaccineSchedule.findOne({
      vaccineId: findVaccine._id,
      scheduleBy: req.user._id,
      date,
      doseTime,
      scheduleStatus: enumConfig.scheduleStatusEnums.PENDING,
    });

    if (findSchedule) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine is already schedule by this user.",
      });
    }

    const newSchedule = {
      vaccineId: findVaccine._id,
      scheduleBy: req.user._id,
      date,
      doseTime,
      scheduleStatus: enumConfig.scheduleStatusEnums.PENDING,
    };

    const vaccineSchedule = await VaccineSchedule.create(newSchedule);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: activityDescriptions.VACCINE_SCHEDULE.SCHEDULE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      data: vaccineSchedule,
      message: "Vaccine schedule successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.VACCINE_SCHEDULE.SCHEDULE_BY_BOT,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Failed to schedule vaccine by bot.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

const getTodayVaccineSchedules = async (req, res) => {
  try {
    const startOfDay = moment().startOf("day").toDate();
    const endOfDay = moment().endOf("day").toDate();

    const schedules = await VaccineSchedule.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate("vaccineId", "vaccineName provider")
      .populate("scheduleBy", "email fullName profileImage")
      .select("-isReminderSent -createdAt -updatedAt")
      .sort({ createdAt: -1 });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: schedules,
      message: "Today's vaccine schedules retrieved successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE_SCHEDULE.GET,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE_SCHEDULE,
      description: error.message || "Failed to fetch vaccine schedule.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

export default {
  scheduleVaccine,
  getVaccineSchedule,
  updateScheduleStatus,
  updateVaccineSchedule,
  deleteVaccineSchedule,
  getVaccineScheduleByDate,
  scheduleVaccineByBot,
  getTodayVaccineSchedules,
};
