import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import DailyHealthLog from "../models/journaling.model.js";
import moment from "moment";

// -----------------------------
// Create Journaling Entry
// -----------------------------
// This endpoint allows users to create a new Journaling entry for the day, including details like mood, exercise, nutrition, and other health metrics. It validates the input, ensuring that at least one meaningful metric is provided.
const createJournalingEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = req.body;

    // Ensure date is provided, default to today if not
    const date = payload.date ? new Date(payload.date) : new Date();

    // Check if log already exists for this user & date
    let existingLog = await DailyHealthLog.findOne({ userId, date });

    if (existingLog) {
      return apiResponse({
        res,
        statusCode: StatusCodes.CONFLICT,
        status: false,
        message:
          "Journaling entry already exists for this date. Please update instead.",
      });
    }

    // Additional validation: Check if all numeric values are 0 and no meaningful health notes
    const numericFields = [
      "mood",
      "exercise",
      "sleepQuality",
      "nutrition",
      "energyLevel",
      "stressLevel",
      "hydration",
      "painLevel",
      "steps",
      "focus",
      "overallWellbeing",
      "anxietyLevel",
      "socialInteraction",
      "medicationAdherence",
    ];

    const allZero = numericFields.every((field) => {
      const val = payload[field];
      return val === undefined || val === null || val === 0;
    });

    const hasHealthNotes =
      payload.healthNotes &&
      payload.healthNotes.length > 0 &&
      payload.healthNotes.some((note) => note && note.trim().length > 0);

    if (allZero && !hasHealthNotes) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message:
          "Please fill detailed information properly. At least one health metric should have a meaningful value or add journal notes.",
      });
    }

    const newLog = await DailyHealthLog.create({
      userId,
      date,
      ...payload,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      status: true,
      message: "Journaling entry created successfully.",
      data: newLog,
    });
  } catch (error) {
    console.error("Error creating daily health log:", error);
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

// -----------------------------
// Update Journaling Entry
// -----------------------------
// This endpoint allows users to update an existing journaling entry for a specific date.
const updateJournalingEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.body;

    if (!date) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Date is required to update health log.",
      });
    }

    console.log(date);

    const existingLog = await DailyHealthLog.findOne({ userId, date });

    if (!existingLog) {
      return apiResponse({
        res,
        statusCode: StatusCodes.NOT_FOUND,
        status: false,
        message: "No daily health log found for the given date.",
      });
    }

    Object.assign(existingLog, req.body);
    await existingLog.save();

    // await activityLogService.createActivity({
    //   userId: req.user._id,
    //   userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
    //   activityType: enumConfig.activityTypeEnum.USER.HEALTH_LOG,
    //   activityCategory: enumConfig.activityCategoryEnum.USER,
    //   description: activityDescriptions.USER.SUCCESS.UPDATE_HEALTH_LOG,
    //   status: enumConfig.activityStatusEnum.SUCCESS,
    // });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Daily health log updated successfully.",
      data: existingLog,
    });
  } catch (error) {
    console.error("Error updating daily health log:", error);

    // await activityLogService.createActivity({
    //   userId: req.user._id,
    //   userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
    //   activityType: enumConfig.activityTypeEnum.USER.HEALTH_LOG,
    //   activityCategory: enumConfig.activityCategoryEnum.USER,
    //   description: error.message || "Failed to update health log.",
    //   status: enumConfig.activityStatusEnum.ERROR,
    // });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

// -----------------------------
// Get Journaling Notes Status Calendar
// -----------------------------
// This endpoint fetches the status of Journaling entries for each day in a specific month and year.
const getJournalingNotesStatusCalendar = async (req, res) => {
  try {
    const userId = req.query.userId ? req.query.userId : req.user._id;

    const { month, year } = req.body;

    if (!month || !year) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Month and Year are required.",
      });
    }

    // Month boundaries
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Fetch logs in that month
    const logs = await DailyHealthLog.find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    }).lean();

    // Prepare a map of records by date
    const notesMap = {};
    logs.forEach((log) => {
      const day = new Date(log.date).getDate();
      // ✅ Mark true if *any* entry exists (ignore healthNotes check)
      notesMap[day] = true;
    });

    // Build result for full month
    const daysInMonth = new Date(year, month, 0).getDate();
    const result = [];
    for (let day = 1; day <= daysInMonth; day++) {
      result.push({
        date: `${year}-${month.toString().padStart(2, "0")}-${day
          .toString()
          .padStart(2, "0")}`,
        hasNote: notesMap[day] || false,
      });
    }

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Journaling notes status fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching Journaling notes status:", error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

// -----------------------------
// Get User Journaling Entries
// -----------------------------
// This endpoint allows users to fetch all their Journaling entries for a specific day or range.
const getUserJournalingEntries = async (req, res) => {
  try {
    const userId = req.query.userId ? req.query.userId : req.user._id;
    const { date } = req.query;

    let filter = { userId };

    if (date) {
      let year, month, day;

      if (date.includes("/")) {
        [year, month, day] = date.split("/").map(Number);
      } else if (date.includes("-")) {
        [year, month, day] = date.split("-").map(Number);
      }

      if (!year || !month || !day) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Invalid date format. Use yyyy/mm/dd or yyyy-mm-dd",
        });
      }

      // Start & End of the given date
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59);

      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }

    const logs = await DailyHealthLog.find(filter).sort({ date: -1 }).lean();

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: date
        ? `Journaling entries for ${date} fetched successfully.`
        : "All Journaling entries fetched successfully.",
      data: logs,
    });
  } catch (error) {
    console.error("Error fetching daily health logs:", error);

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
};

// -----------------------------
// Delete Journaling Entry
// -----------------------------
// This endpoint allows users to delete an existing Journaling entry.
const deleteJournalingEntry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { logId } = req.params;
    if (!logId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Log ID is required",
      });
    }

    const log = await DailyHealthLog.findOneAndDelete({ _id: logId, userId });
    if (!log) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "No log found",
      });
    }

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Journaling entry deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Journaling entry:", error);

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
};

// Allowed keys + user-friendly labels
const TYPE_MAP = {
  Mood: "mood",
  Exercise: "exercise",
  "Sleep Quality": "sleepQuality",
  Nutrition: "nutrition",
  "Energy Level": "energyLevel",
  "Stress Level": "stressLevel",
  Hydration: "hydration",
  "Pain Level": "painLevel",
  Steps: "steps",
  Focus: "focus",
  "Overall Wellbeing": "overallWellbeing",
  "Anxiety Level": "anxietyLevel",
  "Social Interaction": "socialInteraction",
  "Medication Adherence": "medicationAdherence",
};

const ALLOWED_TYPES = {
  mood: "Mood",
  exercise: "Exercise",
  sleepQuality: "Sleep Quality",
  nutrition: "Nutrition",
  energyLevel: "Energy Level",
  stressLevel: "Stress Level",
  hydration: "Hydration",
  painLevel: "Pain Level",
  steps: "Steps",
  focus: "Focus",
  overallWellbeing: "Overall Wellbeing",
  anxietyLevel: "Anxiety Level",
  socialInteraction: "Social Interaction",
  medicationAdherence: "Medication Adherence",
};

const INSIGHTS = {
  sleepQuality: "Magnesium is linked to improved sleep quality.",
  mood: "Regular exercise is known to improve mood and reduce stress.",
  exercise: "Consistent daily exercise boosts energy levels.",
  hydration: "Proper hydration supports focus and overall wellbeing.",
  nutrition: "Balanced nutrition improves energy and reduces fatigue.",
  stressLevel: "Mindfulness and breathing exercises reduce stress.",
};

// -----------------------------
// Get Health Log Analytics
// -----------------------------
// This endpoint fetches analytics of a user's daily health logs, such as steps or mood, based on a specific type and time filter (today, this week, or this month). The logs are aggregated, and a percentage representation of the health data is provided for each day within the selected time range.
const getJournalingAnalytics = async (req, res) => {
  try {
    const userId = req.query.userId ? req.query.userId : req.user._id;

    const { type: rawType, filter } = req.query;

    const type = TYPE_MAP[rawType] || rawType;
    // Validate type
    if (!Object.values(TYPE_MAP).includes(type)) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: `Invalid type. Allowed types: ${Object.keys(TYPE_MAP).join(
          ", "
        )}`,
      });
    }

    // Build date range
    let startDate, endDate;
    const today = moment().startOf("day");

    if (filter === "today") {
      startDate = today;
      endDate = moment(today).endOf("day");
    } else if (filter === "thisWeek") {
      startDate = moment().startOf("week"); // Monday start
      endDate = moment().endOf("week");
    } else if (filter === "thisMonth") {
      startDate = moment().startOf("month");
      endDate = moment().endOf("month");
    } else {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Invalid filter. Use: today, thisWeek, thisMonth",
      });
    }

    // Fetch logs
    const logs = await DailyHealthLog.find({
      userId,
      date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
    }).lean();

    // Map logs by date
    const logMap = {};
    logs.forEach((log) => {
      const dayKey = moment(log.date).format("YYYY-MM-DD");
      logMap[dayKey] = log[type];
    });

    // Build result with missing days filled
    const result = [];
    let cursor = moment(startDate);

    while (cursor.isSameOrBefore(endDate)) {
      const dateKey = cursor.format("YYYY-MM-DD");
      const value = logMap[dateKey];

      let percentage = 0;
      if (typeof value === "number") {
        if (type === "steps") {
          // Example: 10k steps = 100%
          percentage = Math.min((value / 10000) * 100, 100);
        } else if (type === "mood") {
          // Mood out of 3
          percentage = Math.min((value / 3) * 100, 100);
        } else {
          // Default out of 5
          percentage = Math.min((value / 5) * 100, 100);
        }
      }

      result.push({
        date: dateKey,
        day: cursor.format("dddd"),
        percentage: Math.round(percentage),
      });

      cursor.add(1, "day");
    }

    // Get insights if available
    const insight =
      INSIGHTS[type] || "Keep tracking your health — consistency matters!";

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Health log analytics fetched successfully.",
      data: {
        type: ALLOWED_TYPES[type],
        filter,
        chart: result,
        insight,
      },
    });
  } catch (error) {
    console.error("Error fetching health log analytics:", error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

export default {
  createJournalingEntry,
  updateJournalingEntry,
  getUserJournalingEntries,
  getJournalingNotesStatusCalendar,
  getJournalingAnalytics,
  deleteJournalingEntry,
};
