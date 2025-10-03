import moment from "moment";
import MedicineSchedule from "../models/medicine.schedual.model.js";
import { apiResponse } from "../helper/api-response.helper.js";
import { StatusCodes } from "http-status-codes";
import enumConfig from "../config/enum.config.js";
import helper from "../helper/common.helper.js";
import caregiverAccessUser from "../middleware/caregiver-access.middleware.js";
import Medicine from "../models/medicine.model.js";
import activityDescriptions from "../config/activity-description.config.js";
import activityLogService from "../services/activity-log.service.js";
import HealthGoalModel from "../models/healthGoal.model.js";
import Onboarding from "../models/onboarding.model.js";
import UserModel from "../models/user.model.js";
import mongoose from "mongoose";

// Create a new medicine schedule
const createSchedule = async (req, res) => {
  try {
    const {
      medicineName,
      quantity,
      startDate,
      endDate,
      doseTimes,
      totalDosesPerDay,
    } = req.body;

    console.log("💊 Request body:", req.body);

    const isValidStartDate = helper.validateFutureDate(startDate);
    const isValidEndDate = helper.validateFutureDate(endDate);

    if (!isValidStartDate || !isValidEndDate) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Selected date must be today or a future date.",
        status: false,
        data: null,
      });
    }

    const medicine = await Medicine.findById(medicineName);
    if (!medicine) {
      console.log("❌ Medicine not found for ID:", medicineName);
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Medicine not found",
        status: false,
        data: null,
      });
    }
    console.log("✅ Medicine found:", medicine.medicineName);

    // Check if medicine is expired
    if (
      medicine.expDate &&
      moment(medicine.expDate).isBefore(moment(), "day")
    ) {
      console.log("❌ Medicine is expired. Expiry date:", medicine.expDate);
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Cannot schedule expired medicine.",
        status: false,
        data: null,
      });
    }

    // 🧮 Calculate total days and required quantity validation
    const start = moment(startDate);
    const end = moment(endDate);
    const totalDays = end.diff(start, "days") + 1; // +1 to include both start and end date
    const totalDosesRequired = totalDays * totalDosesPerDay;

    console.log("📊 Calculation Details:");
    console.log("📅 Total Days:", totalDays);
    console.log("💊 Total Doses Per Day:", totalDosesPerDay);
    console.log("🔢 Total Doses Required:", totalDosesRequired);
    console.log("📦 Available Quantity:", quantity);

    // Check if quantity is sufficient for the entire duration
    if (quantity < totalDosesRequired) {
      console.log("❌ Insufficient quantity for the duration");
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Insufficient quantity! You need ${totalDosesRequired} doses for ${totalDays} days (${totalDosesPerDay} doses per day), but only ${quantity} available. Please increase quantity or reduce duration.`,
        status: false,
        data: {
          totalDays,
          totalDosesRequired,
          availableQuantity: quantity,
          dosesPerDay: totalDosesPerDay,
        },
      });
    }

    // Check if quantity is more than required (waste prevention)
    if (quantity > totalDosesRequired) {
      const excessQuantity = quantity - totalDosesRequired;
      console.log("⚠️ Excess quantity detected:", excessQuantity);
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Excess quantity detected! You only need ${totalDosesRequired} doses for ${totalDays} days, but provided ${quantity}. You have ${excessQuantity} extra doses. Please adjust quantity or extend duration.`,
        status: false,
        data: {
          totalDays,
          totalDosesRequired,
          providedQuantity: quantity,
          excessQuantity,
          dosesPerDay: totalDosesPerDay,
        },
      });
    }

    const isExisting = await MedicineSchedule.findOne({
      medicineName,
      userId: req.user.id,
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      ],
    });

    if (isExisting) {
      console.log(
        "⚠️ Existing schedule found for overlapping dates:",
        isExisting
      );
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "A schedule for this medicine already exists for the same period between the selected start and end dates",
        data: null,
      });
    }

    const isCreatedByUser = await Medicine.findOne({
      _id: medicineName,
      createdByAdmin: false,
      userId: req.user.id,
    });

    if (isCreatedByUser) {
      console.log(
        "👤 Medicine created by user. Available quantity:",
        isCreatedByUser.quantity
      );

      // Check if user has enough medicine in stock
      if (quantity > isCreatedByUser.quantity) {
        console.log("❌ Requested quantity exceeds available stock:", quantity);
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Insufficient stock! You need ${quantity} doses but only ${isCreatedByUser.quantity} available in your medicine inventory. Please reduce quantity or add more medicine to your inventory.`,
          data: {
            requiredQuantity: quantity,
            availableInStock: isCreatedByUser.quantity,
            shortfall: quantity - isCreatedByUser.quantity,
          },
        });
      }
    }

    const today = moment();

    let status = "inactive";
    if (
      today.isSameOrAfter(moment(startDate), "day") &&
      today.isSameOrBefore(moment(endDate), "day")
    ) {
      status = "active";
    }
    console.log("📆 Schedule status:", status);

    const doseLogs = [];
    for (
      let m = moment(startDate);
      m.diff(moment(endDate), "days") <= 0;
      m.add(1, "days")
    ) {
      const doses = doseTimes.map((time) => ({
        time,
        status: enumConfig.scheduleStatusEnums.PENDING,
        isReminderSent: false,
      }));

      doseLogs.push({
        date: m.toDate(),
        doses,
      });
    }
    console.log(
      "🗓️ Dose logs generated for schedule from",
      startDate,
      "to",
      endDate
    );

    const schedule = new MedicineSchedule({
      userId: req.user.id,
      medicineName,
      quantity,
      startDate,
      endDate,
      totalDosesPerDay,
      doseLogs,
      status,
    });

    await schedule.save();
    console.log("✅ Schedule saved successfully:", schedule._id);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.SCHEDULE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      message: "Medicine schedule successfully.",
      status: true,
      data: schedule,
    });
  } catch (error) {
    console.error("🔥 Error in createSchedule:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.SCHEDULE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to schedule medicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Get all schedules for a user
const getScheduleByUser = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const targetUserId = req.params.userId || req.query.userId || requesterId;

    const hasAccess = await caregiverAccessUser(requesterId, targetUserId);

    console.log("🔐 Caregiver Access Granted:", hasAccess);

    if (!hasAccess) {
      return apiResponse({
        res,
        statusCode: StatusCodes.FORBIDDEN,
        status: false,
        message: "Access denied. You are not authorized to view this data.",
      });
    }

    const pagination = helper.paginationFun(req.query);
    const today = new Date();

    // 🔄 Update inactive schedules
    const inactiveSchedules = await MedicineSchedule.find({
      userId: targetUserId,
      status: "inactive",
    });

    for (const schedule of inactiveSchedules) {
      const { startDate, endDate } = schedule;
      if (startDate <= today && today <= endDate) {
        schedule.status = "active";
        await schedule.save();
      } else if (today > endDate) {
        schedule.status = "ended";
        await schedule.save();
      }
    }

    // 🔍 Build filter query
    const filterQuery = { userId: targetUserId };

    if (req.query.search) {
      const medicines = await Medicine.find({
        medicineName: { $regex: req.query.search, $options: "i" },
      }).select("_id");

      const medicineIds = medicines.map((m) => m._id);
      filterQuery.medicineName = {
        $in: medicineIds.length ? medicineIds : [null],
      };
    }

    // 📂 Fetch schedules with search + pagination
    const schedules = await MedicineSchedule.find(filterQuery)
      .populate("medicineName", "medicineName price dosage")
      .select("-doseLogs.doses.isReminderSent")
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 });

    const count = await MedicineSchedule.countDocuments(filterQuery);

    console.log("📊 Total Schedules Found:", count);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: count,
    });

    // 📝 Log activity
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_LIST,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.GET_LIST,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      message: "Schedule fetched successfully.",
      status: true,
      pagination: paginationData,
      data: schedules,
    });
  } catch (error) {
    console.error("❌ Error fetching schedule:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_LIST,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to fetch medicine schedule.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// update status
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const isExisting = await MedicineSchedule.findById(id);
    if (!isExisting) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Medicine schedule not found.",
        data: null,
      });
    }

    isExisting.status = status;
    await isExisting.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      message: "Status updated successfully.",
      status: true,
      data: isExisting,
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to update medicine schedule.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Update dose status and reduce quantity if 'taken'
const updateDoseStatus = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { date, time, status } = req.body;

    const schedule = await MedicineSchedule.findById(scheduleId);
    if (!schedule)
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Schedule not found",
        status: false,
        data: null,
      });

    const log = schedule.doseLogs.find(
      (d) =>
        moment(d.date).format("YYYY-MM-DD") ===
        moment(date).format("YYYY-MM-DD")
    );
    if (!log)
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "No dose log found for the selected date. Please ensure the schedule is correct.",
        status: false,
        data: null,
      });

    const dose = log.doses.find((t) => t.time === time);
    if (!dose)
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `No dose found for the time "${time}". Please verify the time and try again.`,
        status: false,
        data: null,
      });

    if (dose.status === enumConfig.scheduleStatusEnums.PENDING) {
      dose.status = status;
      if (status === enumConfig.scheduleStatusEnums.TAKEN) {
        const findMedicine = await Medicine.findOne({
          _id: schedule.medicineName,
          createdByAdmin: false,
          userId: req.user.id,
        });
        if (findMedicine) {
          if (findMedicine.quantity <= 0) {
            return apiResponse({
              res,
              statusCode: StatusCodes.BAD_REQUEST,
              message:
                "Medicine's quantity is zero. Please refill before taking a dose.",
              status: false,
              data: null,
            });
          }
          findMedicine.quantity -= 1;
          await findMedicine.save();
        }
      }
    } else if (dose.status === enumConfig.scheduleStatusEnums.MISSED) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "This dose was missed. Please ensure to take it at the next scheduled time.",
        status: false,
        data: null,
      });
    } else if (dose.status === enumConfig.scheduleStatusEnums.TAKEN) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "This dose has already been taken. You cannot update the status again.",
        status: false,
        data: null,
      });
    }

    await schedule.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.UPDATE_DOSE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.UPDATE_DOSE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: schedule,
      message: "Dose status updated successfully",
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.UPDATE_DOSE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to update medicine schedule dose.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Get dose logs
const getDoseLogs = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await MedicineSchedule.findById(scheduleId).select(
      "-doseLogs.doses.isReminderSent"
    );
    if (!schedule)
      return apiResponse({
        res,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Schedule not found.",
        status: false,
        data: null,
      });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_DOSE_LOGS,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.GET_DOSE_LOGS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      message: "Dose logs fetch successfully.",
      status: true,
      data: schedule.doseLogs,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_DOSE_LOGS,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description:
        error.message || "Failed to fetch medicine schedule dose logs.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Get todays doses
const getTodaysDoses = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const targetUserId = req.params.userId || req.query.userId || requesterId;

    const hasAccess = await caregiverAccessUser(requesterId, targetUserId);
    if (!hasAccess) {
      return apiResponse({
        res,
        statusCode: StatusCodes.FORBIDDEN,
        status: false,
        message: "Access denied. You are not authorized to view this data.",
      });
    }

    const today = moment().format("YYYY-MM-DD");

    // ✅ Fetch schedules in one go, lean for performance
    const schedules = await MedicineSchedule.find({ userId: targetUserId })
      .select("-doseLogs.doses.isReminderSent")
      .sort({ createdAt: -1 })
      .lean();

    // ✅ Collect medicineIds for batch query (avoid N+1 queries)
    const medicineIds = schedules.map((s) => s.medicineName);
    const medicines = await Medicine.find({ _id: { $in: medicineIds } })
      .select("medicineName dosage description")
      .lean();

    // ✅ Build a map for quick lookup
    const medicineMap = new Map(medicines.map((m) => [String(m._id), m]));

    const todayDoses = [];
    for (const schedule of schedules) {
      const todayLog = schedule.doseLogs?.find(
        (log) => moment(log.date).format("YYYY-MM-DD") === today
      );

      const findMedication = medicineMap.get(String(schedule.medicineName));

      if (todayLog && findMedication) {
        for (const dose of todayLog.doses) {
          todayDoses.push({
            scheduleId: schedule._id,
            medicineName: findMedication.medicineName,
            dosage: findMedication.dosage,
            date: todayLog.date,
            doses: {
              time: dose.time,
              status: dose.status,
              note:
                dose.status === "missed"
                  ? "You missed this dose. Please take it as soon as possible."
                  : findMedication.description || "undefined",
            },
          });
        }
      }
    }

    // ✅ Fetch health + onboarding data in parallel
    const [healthData, onboardData] = await Promise.all([
      HealthGoalModel.findOne({ userId: targetUserId }).select(
        "-_id -userId -createdAt -updatedAt"
      ),
      Onboarding.findOne({ userId: targetUserId }).select(
        "-_id -userId -createdAt -updatedAt -__v -perspective"
      ),
    ]);

    // ✅ Sort by time once after aggregation
    todayDoses.sort((a, b) => {
      const timeA = moment(a.doses.time, ["hh:mm A"]).toDate();
      const timeB = moment(b.doses.time, ["hh:mm A"]).toDate();
      return timeA - timeB;
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_TODAY_DOSE_LOGS,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.GET_DOSE_LOGS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      body: { todayDoses, healthData, onboardData },
      message: "Doses fetched successfully.",
    });
  } catch (error) {
    console.error("Error in getTodaysDoses:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_TODAY_DOSE_LOGS,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description:
        error.message || "Failed to fetch medicine schedule dose logs.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Get doses with quantity
const getAllDosesWithQuantity = async (req, res) => {
  try {
    const userId = req.user.id;

    const schedules = await MedicineSchedule.find({ userId })
      .populate("medicineName", "medicineName dosage price")
      .select("-doseLogs.doses.isReminderSent");

    const result = schedules.map((schedule) => ({
      scheduleId: schedule._id,
      medicineName: schedule.medicineName,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      totalDosesPerDay: schedule.totalDosesPerDay,
      quantityRemaining: schedule.quantity,
      doseLogs: schedule.doseLogs,
    }));

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_DOSE_WITH_QUANTITY,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description:
        activityDescriptions.MEDICINE_SCHEDULE.GET_DOSE_WITH_QUANTITY,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: result,
      message: "Doses fetch successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_DOSE_WITH_QUANTITY,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to fetch medicine schedule doses.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Add medicine quantity
const addMedicineQuantity = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
      return apiResponse({
        res,
        status: false,
        data: null,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Quantity to add must be greater than 0",
      });
    }

    const schedule = await MedicineSchedule.findById(scheduleId);
    if (!schedule) {
      return apiResponse({
        res,
        status: false,
        data: null,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Schedule not found",
      });
    }

    // --- check if medicine created by login user ---
    const isCreatedByUser = await Medicine.findOne({
      _id: schedule.medicineName,
      createdByAdmin: false,
      userId: req.user.id,
    });

    if (!isCreatedByUser) {
      return apiResponse({
        res,
        status: false,
        data: null,
        statusCode: StatusCodes.NOT_FOUND,
        message: "You are not authorized to update this quantity.",
      });
    }

    if (
      isCreatedByUser &&
      schedule.quantity + quantity > isCreatedByUser.quantity
    ) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Total quantity after addition (${
          schedule.quantity + quantity
        }) exceeds available medicine quantity (${isCreatedByUser.quantity}).`,
        data: null,
      });
    }
    schedule.quantity += quantity;
    await schedule.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.ADD_QUANTITY,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.ADD_QUANTITY,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Quantity added successfully",
      data: {
        scheduleId: schedule._id,
        newQuantity: schedule.quantity,
      },
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.ADD_QUANTITY,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to add medicine quantity.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Get doses by date
const getDosesByDate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    if (!date || !moment(date, "YYYY-MM-DD", true).isValid()) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Invalid or missing date. Use format YYYY-MM-DD.",
        data: null,
      });
    }

    // ✅ Populate from Medicine model
    const schedules = await MedicineSchedule.find({ userId }).populate(
      "medicineName",
      "medicineName description takenForSymptoms associatedRisks"
    );

    const dosesByDate = [];

    schedules.forEach((schedule) => {
      const log = schedule.doseLogs.find(
        (entry) => moment(entry.date).format("YYYY-MM-DD") === date
      );

      if (log) {
        dosesByDate.push({
          scheduleId: schedule._id,
          medicine: {
            name: schedule.medicineName?.medicineName || "Unknown",
            description: schedule.medicineName?.description || "",
            takenForSymptoms: schedule.medicineName?.takenForSymptoms || "",
            associatedRisks: schedule.medicineName?.associatedRisks || "",
          },
          date: log.date,
          doses: log.doses,
        });
      }
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_DOSE_BY_DATE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.GET_DOSE_BY_DATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: dosesByDate,
      message: `Doses for ${date} fetched successfully.`,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.GET_DOSE_BY_DATE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to fetch medicine dose by date.",
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

// Create medicine schedule by bot
const createMedicineScheduleByBot = async (req, res) => {
  try {
    const {
      medicineName,
      quantity,
      startDate,
      endDate,
      doseTimes,
      totalDosesPerDay,
    } = req.body;

    const findMedicine = await Medicine.findOne({ medicineName });
    if (!findMedicine) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "This given medicine is not found.",
        status: false,
        data: null,
      });
    }

    const isExisting = await MedicineSchedule.findOne({
      medicineName: findMedicine._id,
      userId: req.user.id,
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      ],
    });

    if (isExisting) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "A schedule for this medicine already exists for the same period between the selected start and end dates.",
        data: null,
      });
    }

    const isCreatedByUser = await Medicine.findOne({
      _id: findMedicine._id,
      createdByAdmin: false,
      userId: req.user.id,
    });

    if (isCreatedByUser && quantity > isCreatedByUser.quantity) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Only ${isCreatedByUser.quantity} items available. Please reduce your quantity.`,
        data: null,
      });
    }

    const start = moment(startDate);
    const end = moment(endDate);
    const today = moment();

    // Determine status: active if today is between start and end, else inactive
    let status = "inactive";
    if (today.isSameOrAfter(start, "day") && today.isSameOrBefore(end, "day")) {
      status = "active";
    }

    const doseLogs = [];

    for (let m = moment(start); m.diff(end, "days") <= 0; m.add(1, "days")) {
      const doses = doseTimes.map((time) => ({
        time,
        status: enumConfig.scheduleStatusEnums.PENDING,
        isReminderSent: false,
      }));

      doseLogs.push({
        date: m.toDate(),
        doses,
      });
    }

    const schedule = new MedicineSchedule({
      userId: req.user.id,
      medicineName: findMedicine._id,
      quantity,
      startDate,
      endDate,
      totalDosesPerDay,
      doseLogs,
      status,
    });

    await schedule.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.SCHEDULE_BY_BOT,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: activityDescriptions.MEDICINE_SCHEDULE.SCHEDULE_BY_BOT,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      message: "Medicine scheduled successfully.",
      status: true,
      data: schedule,
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.SCHEDULE_BY_BOT,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
      description: error.message || "Failed to schedule medicine by bot.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// --- FAST helpers: UTC parsing + fast doseLogs builder (native Date, no heavy moment loop) ---
const parseUTC = (v) => moment.utc(v);
const validateFutureDateUTC = (v) => helper.validateFutureDate(v);

const buildDoseLogsUTCFast = (startISO, endISO, times = []) => {
  const s = parseUTC(startISO);
  const e = parseUTC(endISO);

  if (!s.isValid() || !e.isValid()) throw new Error("Invalid start/end date");
  const sDay = Date.UTC(s.year(), s.month(), s.date());
  const eDay = Date.UTC(e.year(), e.month(), e.date());
  if (sDay > eDay) throw new Error("startDate must be on/before endDate");

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((eDay - sDay) / dayMs) + 1;

  const dosesTemplate = (times || []).map((t) => ({
    time: t,
    status: enumConfig.scheduleStatusEnums.PENDING,
    isReminderSent: false,
  }));

  const out = new Array(days);
  for (let i = 0; i < days; i++) {
    out[i] = {
      date: new Date(sDay + i * dayMs),
      doses: dosesTemplate.map((d) => ({ ...d })),
    };
  }
  return out;
};

// ---------- Update medicine schedule ----------
const updateMedicineSchedule = async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const {
      medicineName,
      quantity,
      startDate,
      endDate,
      doseTimes,
      totalDosesPerDay,
    } = req.body || {};

    // 1) Load schedule (only once)
    const existingSchedule = await MedicineSchedule.findById(scheduleId).exec();
    if (!existingSchedule) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Medicine schedule not found",
        status: false,
        data: null,
      });
    }

    // 2) Compute "effective" fields
    const effective = {
      medicineName:
        typeof medicineName !== "undefined"
          ? medicineName
          : existingSchedule.medicineName,
      quantity:
        typeof quantity !== "undefined" ? quantity : existingSchedule.quantity,
      startDate:
        typeof startDate !== "undefined"
          ? startDate
          : existingSchedule.startDate,
      endDate:
        typeof endDate !== "undefined" ? endDate : existingSchedule.endDate,
      totalDosesPerDay:
        typeof totalDosesPerDay !== "undefined"
          ? totalDosesPerDay
          : existingSchedule.totalDosesPerDay,
    };

    // ✅ 3) Quantity validation (same logic as createSchedule)
    const sUTC = parseUTC(effective.startDate);
    const eUTC = parseUTC(effective.endDate);
    if (!sUTC.isValid() || !eUTC.isValid()) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid start/end date.",
        status: false,
        data: null,
      });
    }

    const totalDays = eUTC.diff(sUTC, "days") + 1;
    const totalDosesRequired = totalDays * effective.totalDosesPerDay;

    if (effective.quantity < totalDosesRequired) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Insufficient quantity! You need ${totalDosesRequired} doses for ${totalDays} days (${effective.totalDosesPerDay} per day), but only ${effective.quantity} available. Please increase quantity or reduce duration.`,
        data: {
          totalDays,
          totalDosesRequired,
          availableQuantity: effective.quantity,
          dosesPerDay: effective.totalDosesPerDay,
        },
      });
    }

    if (effective.quantity > totalDosesRequired) {
      const excessQuantity = effective.quantity - totalDosesRequired;
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Excess quantity detected! You only need ${totalDosesRequired} doses for ${totalDays} days, but provided ${effective.quantity}. You have ${excessQuantity} extra doses. Please adjust quantity or extend duration.`,
        data: {
          totalDays,
          totalDosesRequired,
          providedQuantity: effective.quantity,
          excessQuantity,
          dosesPerDay: effective.totalDosesPerDay,
        },
      });
    }

    // If nothing changed, return early (super fast)
    const nothingChanged =
      (typeof medicineName === "undefined" ||
        String(existingSchedule.medicineName) === String(medicineName)) &&
      (typeof quantity === "undefined" ||
        existingSchedule.quantity === quantity) &&
      (typeof startDate === "undefined" ||
        String(existingSchedule.startDate) === String(startDate)) &&
      (typeof endDate === "undefined" ||
        String(existingSchedule.endDate) === String(endDate)) &&
      (typeof totalDosesPerDay === "undefined" ||
        existingSchedule.totalDosesPerDay === totalDosesPerDay) &&
      typeof doseTimes === "undefined";
    if (nothingChanged) {
      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        message: "No changes detected.",
        status: true,
        data: existingSchedule,
      });
    }

    // 3) Existing doseTimes if not provided
    const existingDoseTimes =
      Array.isArray(existingSchedule.doseLogs) &&
      existingSchedule.doseLogs.length > 0
        ? (existingSchedule.doseLogs[0]?.doses || [])
            .map((d) => d.time)
            .filter(Boolean)
        : [];
    const effectiveDoseTimes = Array.isArray(doseTimes)
      ? doseTimes
      : existingDoseTimes;

    // 4) Validate only fields sent (fast checks)
    if (
      typeof startDate !== "undefined" &&
      !validateFutureDateUTC(effective.startDate)
    ) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Selected start date must be today or a future date.",
        status: false,
        data: null,
      });
    }
    if (
      typeof endDate !== "undefined" &&
      !validateFutureDateUTC(effective.endDate)
    ) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Selected end date must be today or a future date.",
        status: false,
        data: null,
      });
    }

    if (typeof startDate !== "undefined" || typeof endDate !== "undefined") {
      const sUTC = parseUTC(effective.startDate);
      const eUTC = parseUTC(effective.endDate);
      if (!sUTC.isValid() || !eUTC.isValid() || sUTC.isAfter(eUTC, "day")) {
        return apiResponse({
          res,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Invalid date range: start date must be on/before end date.",
          status: false,
          data: null,
        });
      }
    }

    // 5) Parallel lookups only if needed (medicine/quantity/overlap)
    const needsMedLookup =
      typeof medicineName !== "undefined" || typeof quantity !== "undefined";
    const needsOverlap =
      typeof medicineName !== "undefined" ||
      typeof startDate !== "undefined" ||
      typeof endDate !== "undefined";

    let medDoc = null;
    let isOverlapping = null;

    await Promise.all([
      // Medicine existence / quantity (only needed if med or quantity affected)
      (async () => {
        if (!needsMedLookup) return;
        // Fetch minimal fields we actually use
        medDoc = await Medicine.findById(effective.medicineName)
          .select("_id createdByAdmin userId quantity")
          .lean();
      })(),
      // Overlap (project _id only, lean for speed)
      (async () => {
        if (!needsOverlap) return;
        isOverlapping = await MedicineSchedule.findOne({
          medicineName: effective.medicineName,
          userId: req.user.id,
          _id: { $ne: scheduleId },
          startDate: { $lte: effective.endDate },
          endDate: { $gte: effective.startDate },
        })
          .select("_id")
          .lean();
      })(),
    ]);

    if (needsMedLookup) {
      if (!medDoc) {
        return apiResponse({
          res,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Medicine not found",
          status: false,
          data: null,
        });
      }
      if (
        typeof quantity !== "undefined" &&
        medDoc.createdByAdmin === false &&
        String(medDoc.userId) === String(req.user.id)
      ) {
        if (effective.quantity > (medDoc.quantity ?? 0)) {
          return apiResponse({
            res,
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Only ${
              medDoc.quantity ?? 0
            } item(s) available. Please reduce your quantity.`,
            data: null,
          });
        }
      }
    }

    if (needsOverlap && isOverlapping) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "An existing schedule overlaps with the selected date range.",
        data: null,
      });
    }

    // 6) doseTimes & totalDosesPerDay consistency
    if (
      typeof totalDosesPerDay !== "undefined" &&
      typeof doseTimes === "undefined"
    ) {
      if (effective.totalDosesPerDay !== existingSchedule.totalDosesPerDay) {
        return apiResponse({
          res,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Provide dose times when changing totalDosesPerDay.",
          status: false,
          data: null,
        });
      }
    }
    if (
      typeof doseTimes !== "undefined" &&
      typeof totalDosesPerDay === "undefined"
    ) {
      effective.totalDosesPerDay = Array.isArray(doseTimes)
        ? doseTimes.length
        : existingSchedule.totalDosesPerDay;
    }
    if (effective.totalDosesPerDay && effectiveDoseTimes?.length) {
      if (effective.totalDosesPerDay !== effectiveDoseTimes.length) {
        return apiResponse({
          res,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Total doses per day must match the length of dose times.",
          status: false,
          data: null,
        });
      }
    }

    // 7) Decide if we must rebuild doseLogs
    const shouldRebuildDoseLogs =
      typeof startDate !== "undefined" ||
      typeof endDate !== "undefined" ||
      typeof doseTimes !== "undefined";

    // 8) Status (UTC day compare)
    const todayUTC = moment.utc();
    const status =
      todayUTC.isSameOrAfter(parseUTC(effective.startDate), "day") &&
      todayUTC.isSameOrBefore(parseUTC(effective.endDate), "day")
        ? "active"
        : "inactive";

    // 9) Apply only provided fields
    if (typeof medicineName !== "undefined")
      existingSchedule.medicineName = effective.medicineName;
    if (typeof quantity !== "undefined")
      existingSchedule.quantity = effective.quantity;
    if (typeof startDate !== "undefined")
      existingSchedule.startDate = effective.startDate;
    if (typeof endDate !== "undefined")
      existingSchedule.endDate = effective.endDate;
    if (typeof totalDosesPerDay !== "undefined")
      existingSchedule.totalDosesPerDay = effective.totalDosesPerDay;

    // Rebuild doseLogs only if required (fast builder)
    if (shouldRebuildDoseLogs) {
      existingSchedule.doseLogs = buildDoseLogsUTCFast(
        effective.startDate,
        effective.endDate,
        effectiveDoseTimes
      );
    }

    existingSchedule.status = status;

    await existingSchedule.save();

    // 10) Non-blocking activity log (doesn't slow response)
    activityLogService
      .createActivity({
        userId: req.user._id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.SCHEDULE,
        activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
        description: activityDescriptions.MEDICINE_SCHEDULE.UPDATE,
        status: enumConfig.activityStatusEnum.SUCCESS,
      })
      .catch((e) => console.error("Activity log error:", e));

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      message: "Medicine schedule updated successfully.",
      status: true,
      data: existingSchedule,
    });
  } catch (error) {
    console.error("🔥 Error in updateMedicineSchedule:", error);
    // Fire-and-forget error log
    activityLogService
      .createActivity({
        userId: req.user._id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.MEDICINE_SCHEDULE.SCHEDULE,
        activityCategory: enumConfig.activityCategoryEnum.MEDICINE_SCHEDULE,
        description: error.message || "Failed to update medicine schedule.",
        status: enumConfig.activityStatusEnum.ERROR,
      })
      .catch(() => {});
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Delete medicine schedule
const deleteMedicineSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const isExist = await MedicineSchedule.findOne({
      userId: req.user.id,
      _id: id,
    });

    if (!isExist) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Medicine schedule not found.",
        data: null,
      });
    }

    await MedicineSchedule.deleteOne({ _id: id });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Medicine schedule deleted successfully.",
      data: null,
    });
  } catch (error) {
    console.log(error);
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

// Get monthly schedule report
const getMonthlyScheduleReport = async (req, res) => {
  try {
    const userId = req.user?._id;
    // ---- Parse params ----
    const now = new Date();
    const year = Number(req.query.year) || now.getUTCFullYear();
    const month1based = Number(req.query.month) || now.getUTCMonth() + 1;
    if (month1based < 1 || month1based > 12) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid month. Use 1..12.",
        data: null,
      });
    }
    const month0 = month1based - 1;
    const monthStart = new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59, 999)); // last day of month
    const maybeMedicineId = req.query.medicineId;
    const medicineFilter =
      maybeMedicineId && mongoose.Types.ObjectId.isValid(maybeMedicineId)
        ? { medicineName: new mongoose.Types.ObjectId(maybeMedicineId) }
        : {};
    // ---- Success status set (robust to different enum names) ----
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
    // ---- Helpers for week buckets ----
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
    // ---- Init accumulators ----
    const weekStats = {
      1: { taken: 0, total: 0 },
      2: { taken: 0, total: 0 },
      3: { taken: 0, total: 0 },
      4: { taken: 0, total: 0 },
      5: { taken: 0, total: 0 },
    };
    // ---- Fetch schedules for this user that overlap the month (light filter) ----
    // Overlap logic: (startDate <= monthEnd) AND (endDate >= monthStart) OR null endDate.
    const schedules = await MedicineSchedule.find({
      userId,
      ...medicineFilter,
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
    // ---- Aggregate adherence from doseLogs ----
    for (const sch of schedules) {
      const logs = Array.isArray(sch.doseLogs) ? sch.doseLogs : [];
      for (const daily of logs) {
        const d = daily?.date;
        if (!d) continue;
        const dt = new Date(d);
        if (dt < monthStart || dt > monthEnd) continue;
        const wb = weekOfMonth(dt);
        const entries = Array.isArray(daily.doses) ? daily.doses : [];
        // Denominator choice:
        //   By default we count ALL entries present in doseLogs for the day (incl. PENDING).
        //   If you want to EXCLUDE PENDING from denominator, replace "entries.length" with:
        //     entries.filter(e => e.status && e.status !== enumConfig.scheduleStatusEnums.PENDING).length
        weekStats[wb].total += entries.length;
        for (const e of entries) {
          const statusVal = e?.status;
          if (statusVal && TAKEN_SET.has(statusVal)) {
            weekStats[wb].taken += 1;
          }
        }
      }
    }
    // ---- Build response ----
    const toPercent = (t, n) => (n > 0 ? Math.round((t / n) * 100) : 0);
    const weeks = [1, 2, 3, 4, 5].map((w) => {
      const r = weekRange(w);
      const { taken, total } = weekStats[w];
      return {
        week: `week${w}`,
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
    // Activity log (best-effort)
    try {
      await activityLogService.createActivity({
        userId,
        userRole: Array.isArray(req.user?.role)
          ? req.user.role
          : [req.user?.role].filter(Boolean),
        activityType:
          enumConfig?.activityTypeEnum?.MEDICINE_SCHEDULE?.GET_REPORT,
        activityCategory: enumConfig?.activityCategoryEnum?.MEDICINE,
        description:
          `Monthly schedule report for ${year}-${String(month1based).padStart(
            2,
            "0"
          )}` + (maybeMedicineId ? ` (medicineId=${maybeMedicineId})` : ""),
        status: enumConfig?.activityStatusEnum?.SUCCESS ?? "SUCCESS",
      });
    } catch {}
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Monthly medicine schedule report generated.",
      data: {
        month: `${year}-${String(month1based).padStart(2, "0")}`,
        range: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
        filter: { medicineId: maybeMedicineId || null },
        overview: {
          totalTaken: totals.taken,
          totalDoses: totals.total,
          adherencePercent: toPercent(totals.taken, totals.total),
        },
        weeks, // [{ week:"week1", adherencePercent: 90, ... }, ...]
      },
    });
  } catch (error) {
    console.log(error);
    // Log failure (best-effort)
    try {
      await activityLogService.createActivity({
        userId: req.user?._id,
        userRole: Array.isArray(req.user?.role)
          ? req.user.role
          : [req.user?.role].filter(Boolean),
        activityType:
          enumConfig?.activityTypeEnum?.MEDICINE_SCHEDULE?.GET_REPORT,
        activityCategory: enumConfig?.activityCategoryEnum?.MEDICINE,
        description: error?.message || "Failed to generate monthly report.",
        status: enumConfig?.activityStatusEnum?.ERROR,
      });
    } catch {}
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to generate monthly report.",
      data: null,
    });
  }
};

export default {
  createSchedule,
  getScheduleByUser,
  updateDoseStatus,
  getDoseLogs,
  getTodaysDoses,
  getAllDosesWithQuantity,
  addMedicineQuantity,
  getDosesByDate,
  updateStatus,
  createMedicineScheduleByBot,
  updateMedicineSchedule,
  deleteMedicineSchedule,
  getMonthlyScheduleReport,
};
