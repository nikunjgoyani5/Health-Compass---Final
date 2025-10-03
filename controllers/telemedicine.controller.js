import moment from "moment";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import enumConfig from "../config/enum.config.js";
import { apiResponse } from "../helper/api-response.helper.js";
import Telemedicine from "../models/telemedicine.model.js";
import helper from "../helper/common.helper.js";
import UserModel from "../models/user.model.js";
import { sendPushNotificationAndSave } from "../services/notification.service.js";
import DoctorAvailability from "../models/availability.model.js";
import emailService from "../services/email.service.js";
import smsService from "../services/sms.service.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";

// --- Create Telemedicine Detail ---
const createTelemedicineDetail = async (req, res) => {
  try {
    const data = req.body;
    data.userId = req.user._id;

    const {
      appointmentStartTime,
      appointmentEndTime,
      appointmentDate,
      doctorId,
    } = data;

    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    if (
      !timeRegex.test(appointmentStartTime) ||
      !timeRegex.test(appointmentEndTime)
    ) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid time format. Use 'hh:mm AM/PM'",
      });
    }

    const parseTime = (timeStr) => {
      const [time, modifier] = timeStr.toUpperCase().split(" ");
      let [hours, minutes] = time.split(":").map(Number);
      if (modifier === "PM" && hours !== 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;
      return { hours, minutes };
    };

    const now = new Date();
    const apptDate = new Date(appointmentDate);
    apptDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (apptDate < today) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Appointment date cannot be in the past.",
      });
    }

    const { hours: startHours, minutes: startMinutes } =
      parseTime(appointmentStartTime);
    const { hours: endHours, minutes: endMinutes } =
      parseTime(appointmentEndTime);

    const startDateTime = new Date(appointmentDate);
    startDateTime.setHours(startHours, startMinutes, 0, 0);

    const endDateTime = new Date(appointmentDate);
    endDateTime.setHours(endHours, endMinutes, 0, 0);

    if (endDateTime <= startDateTime) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Appointment end time must be after start time.",
      });
    }

    if (apptDate.getTime() === today.getTime() && startDateTime <= now) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Start time must be in the future if the appointment is today.",
      });
    }

    const doctor = await UserModel.findOne({
      _id: doctorId,
      role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
    });

    if (!doctor) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Doctor not found",
      });
    }

    // Get day like 'Monday'
    const appointmentDay = moment(appointmentDate).format("dddd");

    const findAvailability = await DoctorAvailability.findOne({
      doctorId,
    });

    if (!findAvailability) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Doctor availability not found",
      });
    }

    const doctorAvailability = findAvailability.availability.find(
      (avail) => avail.day === appointmentDay
    );

    if (!doctorAvailability) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Doctor is not available on ${appointmentDay}`,
      });
    }

    // Check if selected slot exactly matches one of the available slots
    const isExactSlotAvailable = doctorAvailability.shift.some(
      (slot) =>
        slot.startTime === appointmentStartTime &&
        slot.endTime === appointmentEndTime
    );

    if (!isExactSlotAvailable) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Doctor is not available at (${appointmentStartTime} - ${appointmentEndTime})`,
      });
    }

    const conflict = await Telemedicine.findOne({
      doctorId,
      appointmentDate,
      appointmentStartTime,
      appointmentEndTime,
      status: {
        $in: [
          enumConfig.appointmentStatusEnums.SCHEDULED,
          enumConfig.appointmentStatusEnums.COMPLETED,
        ],
      },
    });

    if (conflict) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Doctor already has an appointment from ${appointmentStartTime} to ${appointmentEndTime} on ${moment(
          appointmentDate
        ).format("YY-MM-DD")}`,
      });
    }

    // All validations passed, create appointment
    const telemedicineDetail = await Telemedicine.create(data);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: activityDescriptions.TELEMEDICINE.CREATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: "Telemedicine appointment created successfully",
      data: telemedicineDetail,
    });
  } catch (error) {
    console.error("Error in createTelemedicineDetail:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: error.message || "Failed to create telemedicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
};

// --- Get Telemedicine Detail ---
const getTelemedicineDetail = async (req, res) => {
  try {
    const filter = {};
    const { doctorId, date, status, time, type, startDate, endDate } =
      req.query;

    if (req.user.role.includes(enumConfig.userRoleEnum.USER)) {
      filter.userId = req.user._id;
    }

    if (status) filter.status = status;
    if (doctorId) filter.doctorId = new mongoose.Types.ObjectId(doctorId);
    if (type) filter.appointmentType = type;
    if (time) filter.appointmentStartTime = time;

    if (date) {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate)) {
        const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        filter.appointmentDate = {
          $gte: startOfDay,
          $lt: endOfDay,
        };
      }
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (!isNaN(start) && !isNaN(end)) {
        const startOfDay = new Date(start.setHours(0, 0, 0, 0));
        const endOfDay = new Date(end.setHours(23, 59, 59, 999));

        filter.appointmentDate = {
          $gte: startOfDay,
          $lte: endOfDay,
        };
      }
    }

    const pagination = helper.paginationFun(req.query);

    const telemedicineDetails = await Telemedicine.find(filter)
      .populate("doctorId", "fullName profileImage specialization")
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ appointmentDate: 1 });

    let count = await Telemedicine.countDocuments(filter);
    let paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: count,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: activityDescriptions.TELEMEDICINE.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Telemedicine detail fetched successfully",
      pagination: paginationData,
      data: telemedicineDetails,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: error.message || "Failed to fetch telemedicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Failed to fetch telemedicine detail",
    });
  }
};

// --- Get doctor availability by date ---
const getDoctorAvailabilityByDate = async (req, res) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "doctorId and date are required",
      });
    }

    const doctor = await UserModel.findOne({
      _id: doctorId,
      role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
    });

    if (!doctor) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Doctor not found",
      });
    }

    const parsedDate = moment(date, "YYYY-MM-DD", true);
    if (!parsedDate.isValid()) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid date format. Please use YYYY-MM-DD",
      });
    }

    const dayName = parsedDate.format("dddd");

    const findAvailability = await DoctorAvailability.findOne({ doctorId });
    if (!findAvailability) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: `Doctor is not available on ${dayName}`,
      });
    }

    const availabilityForDay = findAvailability.availability.find(
      (daySlot) => daySlot.day === dayName
    );

    if (!availabilityForDay) {
      return apiResponse({
        res,
        status: true,
        statusCode: StatusCodes.OK,
        message: `Doctor is not available on ${dayName}`,
        data: [],
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.TELEMEDICINE.GET_DOC_AVAILABILITY,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: `Doctor's availability for ${dayName}`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: `Doctor's availability for ${dayName}`,
      data: availabilityForDay.shift,
    });
  } catch (error) {
    console.error("Error fetching doctor availability:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.TELEMEDICINE.GET_DOC_AVAILABILITY,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: error.message || "Failed to fetch doctor's availability.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
};

// --- Update status ---
const updateStatuss = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const telemedicine = await Telemedicine.findById(id)
      .populate({
        path: "doctorId",
        select:
          "fullName email profileImage notificationPreferences fcmToken phoneNumber",
      })
      .populate({
        path: "userId",
        select:
          "fullName email profileImage fcmToken notificationPreferences phoneNumber countryCode",
      });
    const user = telemedicine.userId;
    if (!telemedicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Telemedicine detail not found",
      });
    }

    telemedicine.status = status;
    await telemedicine.save();

    if (status === enumConfig.appointmentStatusEnums.CANCELLED) {
      const type = enumConfig.notificationPreferencesEnum.OTHER;
      const preferences =
        user?.notificationPreferences?.preferences?.[type] || {};

      // 1. Push Notification (check if push preference is true)
      if (preferences.push) {
        await sendPushNotificationAndSave({
          user: user,
          title: "Cancelled Appointment",
          message: `Your appointment with Dr. ${
            telemedicine.doctorId.fullName
          } on ${moment(telemedicine.appointmentDate).format("YY/MM/DD")} at ${
            telemedicine.appointmentStartTime
          } has been cancelled by the doctor.`,
          type,
          image: telemedicine.userId.profileImage,
        });
      }

      // 2. Email Notification (check if email preference is true)
      if (preferences.email) {
        await emailService.cancelledAppointmentByDoctorEmail({
          email: user.email,
          fullName: user.fullName,
          doctorName: telemedicine.doctorId.fullName,
          appointmentDate: moment(telemedicine.appointmentDate).format(
            "DD/MM/YYYY"
          ),
          appointmentTime: `${telemedicine.appointmentStartTime} - ${telemedicine.appointmentEndTime}`,
        });
      }

      // 3. SMS Notification (check if sms preference is true)
      if (preferences.sms) {
        await smsService.sendSMS({
          to: `${user.countryCode}${user.phoneNumber}`,
          message: `Your appointment with Dr. ${
            telemedicine.doctorId.fullName
          } on ${moment(telemedicine.appointmentDate).format(
            "DD/MM/YYYY"
          )} at ${
            telemedicine.appointmentStartTime
          } has been cancelled by the doctor.`,
        });
      }
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.UPDATE_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: activityDescriptions.TELEMEDICINE.UPDATE_STATUS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Telemedicine status updated successfully.",
    });
  } catch (error) {
    console.error("Error updating telemedicine status:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.UPDATE_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: error.message || "Failed to update status telemedicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to update telemedicine status",
    });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const telemedicine = await Telemedicine.findById(id)
      .populate({
        path: "doctorId",
        select:
          "fullName email profileImage notificationPreferences fcmToken phoneNumber countryCode",
      })
      .populate({
        path: "userId",
        select:
          "fullName email profileImage fcmToken notificationPreferences phoneNumber countryCode",
      });

    if (!telemedicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Telemedicine detail not found",
      });
    }

    // -------------------------------------------------------------
    // Entity-level authorization: only THIS appointment's user/doctor may update
    // -------------------------------------------------------------
    const roles = Array.isArray(req.user.role)
      ? req.user.role
      : [req.user.role];
    const actorId = String(req.user._id);
    const apptUserId = String(telemedicine.userId?._id || "");
    const apptDoctorId = String(telemedicine.doctorId?._id || "");

    const isActorDoctor = roles.includes(enumConfig.userRoleEnum.DOCTOR);
    const isActorUser = roles.includes(enumConfig.userRoleEnum.USER);

    const canDoctorUpdate = isActorDoctor && actorId === apptDoctorId;
    const canUserUpdate = isActorUser && actorId === apptUserId;

    if (!(canDoctorUpdate || canUserUpdate)) {
      const isActorDoctor = roles.includes(enumConfig.userRoleEnum.DOCTOR);

      const unauthMsg = isActorDoctor
        ? "You are not the assigned doctor for this appointment."
        : "You are not the creator of this appointment.";

      await activityLogService.createActivity({
        userId: req.user._id,
        userRole: roles,
        activityType: enumConfig.activityTypeEnum.TELEMEDICINE.UPDATE_STATUS,
        activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
        description:
          "Unauthorized status update attempt on telemedicine appointment",
        status: enumConfig.activityStatusEnum.ERROR,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: unauthMsg,
      });
    }

    // -------------------------------------------------------------
    // Authorized: proceed to save + notify counterparty
    // -------------------------------------------------------------
    telemedicine.status = status;
    await telemedicine.save();

    // who acted vs who should be notified
    const actor = canDoctorUpdate ? telemedicine.doctorId : telemedicine.userId;
    const recipient = canDoctorUpdate
      ? telemedicine.userId
      : telemedicine.doctorId;

    const type = enumConfig.notificationPreferencesEnum.OTHER;
    const preferences =
      recipient?.notificationPreferences?.preferences?.[type] || {};

    const apptDateStr = moment(telemedicine.appointmentDate).format(
      "DD/MM/YYYY"
    );
    const timeRangeStr = `${telemedicine.appointmentStartTime} - ${telemedicine.appointmentEndTime}`;
    const isCancelled = status === enumConfig.appointmentStatusEnums.CANCELLED;

    const titles = {
      cancelled: "Appointment Cancelled",
      updated: "Appointment Status Updated",
    };
    const msgs = {
      cancelledByDoctor: `Your appointment with Dr. ${telemedicine.doctorId.fullName} on ${apptDateStr} at ${telemedicine.appointmentStartTime} has been cancelled by the doctor.`,
      cancelledByUser: `The appointment on ${apptDateStr} at ${telemedicine.appointmentStartTime} with Dr. ${telemedicine.doctorId.fullName} has been cancelled by the patient.`,
      genericUpdateForUser: `Your appointment with Dr. ${telemedicine.doctorId.fullName} on ${apptDateStr} (${timeRangeStr}) is now "${status}".`,
      genericUpdateForDoctor: `The appointment with ${telemedicine.userId.fullName} on ${apptDateStr} (${timeRangeStr}) is now "${status}".`,
    };

    const pushTitle = isCancelled ? titles.cancelled : titles.updated;
    const pushBody = isCancelled
      ? canDoctorUpdate
        ? msgs.cancelledByDoctor
        : msgs.cancelledByUser
      : canDoctorUpdate
      ? msgs.genericUpdateForUser
      : msgs.genericUpdateForDoctor;

    // 1) Push
    if (preferences.push) {
      await sendPushNotificationAndSave({
        user: recipient,
        title: pushTitle,
        message: pushBody,
        type,
        image: actor?.profileImage,
      });
    }

    // 2) Email
    if (preferences.email) {
      if (isCancelled) {
        if (canDoctorUpdate) {
          // you already have this template
          await emailService.cancelledAppointmentByDoctorEmail({
            email: recipient.email,
            fullName: recipient.fullName,
            doctorName: telemedicine.doctorId.fullName,
            appointmentDate: apptDateStr,
            appointmentTime: timeRangeStr,
          });
        } else {
          // add this template if missing
          await emailService.cancelledAppointmentByUserEmail?.({
            email: recipient.email,
            fullName: recipient.fullName,
            userName: telemedicine.userId.fullName,
            doctorName: telemedicine.doctorId.fullName,
            appointmentDate: apptDateStr,
            appointmentTime: timeRangeStr,
          });
        }
      } else {
        // generic update template (add if missing)
        await emailService.appointmentStatusUpdatedEmail?.({
          email: recipient.email,
          fullName: recipient.fullName,
          actorName: actor.fullName,
          doctorName: telemedicine.doctorId.fullName,
          patientName: telemedicine.userId.fullName,
          newStatus: status,
          appointmentDate: apptDateStr,
          appointmentTime: timeRangeStr,
        });
      }
    }

    // 3) SMS
    if (preferences.sms && recipient?.phoneNumber) {
      const smsMsg = isCancelled
        ? canDoctorUpdate
          ? msgs.cancelledByDoctor
          : msgs.cancelledByUser
        : canDoctorUpdate
        ? msgs.genericUpdateForUser
        : msgs.genericUpdateForDoctor;

      await smsService.sendSMS({
        to: `${recipient.countryCode}${recipient.phoneNumber}`,
        message: smsMsg,
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: roles,
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.UPDATE_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: activityDescriptions.TELEMEDICINE.UPDATE_STATUS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Telemedicine status updated successfully.",
    });
  } catch (error) {
    console.error("Error updating telemedicine status:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.UPDATE_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: error.message || "Failed to update status telemedicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to update telemedicine status",
    });
  }
};

// --- Update telemedicine detail ---
const updateTelemedicineDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Allowed fields
    const allowedFields = [
      "appointmentDate",
      "appointmentStartTime",
      "appointmentEndTime",
      "appointmentType",
      "doctorId",
      "status",
      "notes",
    ];

    const invalidFields = Object.keys(data).filter(
      (key) => !allowedFields.includes(key)
    );
    if (invalidFields.length > 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Invalid fields provided: ${invalidFields.join(", ")}`,
      });
    }

    const telemedicine = await Telemedicine.findById(id);
    if (!telemedicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Telemedicine detail not found",
      });
    }

    // Time format validation
    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;

    const startTime =
      data.appointmentStartTime || telemedicine.appointmentStartTime;
    const endTime = data.appointmentEndTime || telemedicine.appointmentEndTime;
    const apptDate = data.appointmentDate || telemedicine.appointmentDate;

    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid time format. Use 'hh:mm AM/PM'",
      });
    }

    // Date and time validation
    const parseTime = (timeStr) => {
      const [time, modifier] = timeStr.toUpperCase().split(" ");
      let [hours, minutes] = time.split(":").map(Number);
      if (modifier === "PM" && hours !== 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;
      return { hours, minutes };
    };

    const { hours: startHours, minutes: startMinutes } = parseTime(startTime);
    const { hours: endHours, minutes: endMinutes } = parseTime(endTime);

    const startDateTime = new Date(apptDate);
    startDateTime.setHours(startHours, startMinutes, 0, 0);

    const endDateTime = new Date(apptDate);
    endDateTime.setHours(endHours, endMinutes, 0, 0);

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inputDate = new Date(apptDate);
    inputDate.setHours(0, 0, 0, 0);

    if (inputDate < today) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Appointment date cannot be in the past.",
      });
    }

    if (endDateTime <= startDateTime) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Appointment end time must be after start time.",
      });
    }

    if (inputDate.getTime() === today.getTime() && startDateTime <= now) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Appointment start time must be in the future if scheduled for today.",
      });
    }

    // Availability and conflict check
    if (
      data.appointmentDate ||
      data.appointmentStartTime ||
      data.appointmentEndTime ||
      data.doctorId
    ) {
      const doctorIdToCheck = data.doctorId || telemedicine.doctorId;
      const appointmentDateToCheck = apptDate;
      const appointmentStartTimeToCheck = startTime;
      const appointmentEndTimeToCheck = endTime;

      const doctor = await UserModel.findOne({
        _id: doctorIdToCheck,
        role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
      });

      if (!doctor) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.NOT_FOUND,
          message: "Doctor not found",
        });
      }

      const appointmentDay = moment(
        appointmentDateToCheck,
        "YYYY-MM-DD"
      ).format("dddd");

      const findAvailability = await DoctorAvailability.findOne({
        doctorId: doctorIdToCheck,
      });

      const doctorAvailability = findAvailability?.availability?.find(
        (avail) => avail.day === appointmentDay
      );

      if (!doctorAvailability) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Doctor is not available on ${appointmentDay}`,
        });
      }

      const exactSlotMatch = doctorAvailability.shift.find(
        (slot) =>
          slot.startTime === appointmentStartTimeToCheck &&
          slot.endTime === appointmentEndTimeToCheck
      );

      if (!exactSlotMatch) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Doctor does not have an exact slot from ${appointmentStartTimeToCheck} to ${appointmentEndTimeToCheck} on ${appointmentDay}`,
        });
      }

      const conflict = await Telemedicine.findOne({
        _id: { $ne: id },
        doctorId: doctorIdToCheck,
        appointmentDate: appointmentDateToCheck,
        $or: [
          {
            $and: [
              { appointmentStartTime: { $lt: appointmentEndTimeToCheck } },
              { appointmentEndTime: { $gt: appointmentStartTimeToCheck } },
            ],
          },
        ],
        status: {
          $in: [
            enumConfig.appointmentStatusEnums.SCHEDULED,
            enumConfig.appointmentStatusEnums.COMPLETED,
          ],
        },
      });

      if (conflict) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message:
            "Doctor already has another appointment during this time slot",
        });
      }
    }

    const result = await Telemedicine.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: activityDescriptions.TELEMEDICINE.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Telemedicine detail updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating telemedicine detail:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: error.message || "Failed to update telemedicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to update telemedicine detail",
    });
  }
};

// --- Delete Telemedicine Detail ---
const deleteTelemedicineDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const telemedicine = await Telemedicine.findById(id);
    if (!telemedicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Telemedicine detail not found",
      });
    }

    await Telemedicine.findByIdAndDelete(id);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: activityDescriptions.TELEMEDICINE.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Telemedicine detail deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting telemedicine detail:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.TELEMEDICINE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.TELEMEDICINE,
      description: error.message || "Failed to delete telemedicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to delete telemedicine detail",
    });
  }
};

export default {
  createTelemedicineDetail,
  getTelemedicineDetail,
  getDoctorAvailabilityByDate,
  updateStatus,
  deleteTelemedicineDetail,
  updateTelemedicineDetail,
};
