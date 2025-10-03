import { StatusCodes } from "http-status-codes";
import DailyHealthLog from "../models/journaling.model.js";
import { apiResponse } from "../helper/api-response.helper.js";
import HealthLogSuggestion from "../models/healthLogSuggestion.model.js";
import moment from "moment";

const FIELD_CONFIG = {
  // 🌱 Core Health Metrics
  mood: {
    title: "Check in on your mood",
    description:
      "Logging your mood helps you spot emotional patterns and improve wellbeing.",
    tag: "Log Mood",
  },
  exercise: {
    title: "Keep moving for better health",
    description:
      "No activity logged yet. Even a short walk boosts fitness and energy.",
    tag: "Log Exercise",
  },
  sleepQuality: {
    title: "Reflect on your sleep",
    description:
      "Poor sleep affects energy and mood. Record last night’s rest quality.",
    tag: "Sleep Note",
  },
  nutrition: {
    title: "Track your meals for balance",
    description:
      "You haven’t logged meals today. Healthy nutrition supports overall wellbeing.",
    tag: "Log Nutrition",
  },
  energyLevel: {
    title: "How energetic do you feel?",
    description:
      "Recording your energy helps detect fatigue and lifestyle effects.",
    tag: "Log Energy",
  },
  stressLevel: {
    title: "Check your stress levels",
    description:
      "High stress can affect focus and sleep. Tracking helps with management.",
    tag: "Log Stress",
  },

  // 💧 Lifestyle & Body
  hydration: {
    title: "Stay hydrated to improve focus",
    description:
      "You haven’t logged water in 6 hours. Proper hydration supports better energy.",
    tag: "Log Hydration",
  },
  painLevel: {
    title: "Track discomfort or pain",
    description:
      "Logging pain helps identify triggers and track improvements over time.",
    tag: "Log Pain",
  },
  steps: {
    title: "Keep moving with steps",
    description: "Low step count detected. Aim for short walks to stay active.",
    tag: "Log Steps",
  },
  sedentaryAlert: {
    title: "Time to move!",
    description:
      "You’ve been sitting for long periods. A quick stretch boosts circulation.",
    tag: "Sedentary Alert",
  },

  // 🧠 Mental & Emotional
  focus: {
    title: "Check your focus",
    description:
      "Log your concentration levels to improve productivity habits.",
    tag: "Log Focus",
  },
  overallWellbeing: {
    title: "Log your overall wellbeing",
    description: "Quick daily check-in gives a complete health snapshot.",
    tag: "Wellbeing",
  },
  anxietyLevel: {
    title: "Track anxiety for clarity",
    description:
      "Logging anxiety helps monitor stress patterns and mental health.",
    tag: "Log Anxiety",
  },
  socialInteraction: {
    title: "Track your social connections",
    description:
      "Note interactions today — social wellbeing is key to mental health.",
    tag: "Log Social",
  },

  // 💊 Medical Tracking
  medicationAdherence: {
    title: "Did you take your meds?",
    description:
      "Tracking medications ensures consistent treatment and better outcomes.",
    tag: "Log Medication",
  },
};

/**
 * API 1: Get Today’s Suggestions
 * - Auto-generate suggestions if DailyHealthLog updated
 * - Return only pending (isCompleted: false)
 */
const getTodaySuggestions = async (req, res) => {
  try {
    const userId = req.user.id;

    // Correct date handling
    const todayStart = moment().startOf("day").toDate();
    const todayEnd = moment().endOf("day").toDate();

    // Get today’s health log
    const log = await DailyHealthLog.findOne({
      userId,
      date: { $gte: todayStart, $lte: todayEnd },
    }).lean();

    if (!log) {
      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message: "No health log found for today, so no suggestions.",
        data: {}, // <-- empty object instead of []
      });
    }

    // Prepare LOW value suggestions
    const suggestions = [];
    Object.keys(FIELD_CONFIG).forEach((field) => {
      const value = log[field];

      if (field === "mood") {
        if (value === 1) {
          suggestions.push({
            key: field,
            ...FIELD_CONFIG[field],
          });
        }
      } else {
        if (value == null || (typeof value === "number" && value <= 2)) {
          suggestions.push({
            key: field,
            ...FIELD_CONFIG[field],
          });
        }
      }
    });

    // Upsert into HealthLogSuggestion
    const updated = await HealthLogSuggestion.findOneAndUpdate(
      { userId, date: todayStart },
      { $set: { suggestions } },
      { upsert: true, new: true }
    ).lean();

    // Return only pending
    const pending = updated.suggestions.filter((s) => !s.isCompleted);

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Today's pending suggestions fetched successfully.",
      data: {
        date: updated.date,
        suggestions: pending,
      },
    });
  } catch (error) {
    console.error("Error fetching today suggestions:", error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * API 2: Add/Update Suggestion Note
 */
const addSuggestionNote = async (req, res) => {
  try {
    const userId = req.user.id;
    const { suggestionId, isCompleted, note } = req.body;

    if (!suggestionId) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Suggestion ID is required.",
      });
    }

    // First, fetch the suggestion (for history snapshot)
    const doc = await HealthLogSuggestion.findOne({
      userId,
      "suggestions._id": suggestionId,
    });

    if (!doc) {
      return apiResponse({
        res,
        statusCode: StatusCodes.NOT_FOUND,
        status: false,
        message: "Suggestion not found.",
      });
    }

    const suggestion = doc.suggestions.id(suggestionId);

    // Update current fields
    if (typeof isCompleted === "boolean") suggestion.isCompleted = isCompleted;
    if (note !== undefined) suggestion.note = note;

    // Push a snapshot into history
    doc.history.push({
      key: suggestion.key,
      title: suggestion.title,
      description: suggestion.description,
      tag: suggestion.tag,
      isCompleted: suggestion.isCompleted,
      note: suggestion.note,
      updatedAt: new Date(),
    });

    await doc.save();

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Suggestion updated successfully with history.",
      data: doc,
    });
  } catch (error) {
    console.error("Error updating suggestion with history:", error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * API 3: Get Suggestion Note History
 */
const getSuggestionNoteHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const docs = await HealthLogSuggestion.find({ userId }).lean();

    if (!docs || docs.length === 0) {
      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message: "No suggestion history found.",
        data: [],
      });
    }

    // Collect all histories (exclude empty ones, flatten results)
    const results = docs
      .filter((doc) => Array.isArray(doc.history) && doc.history.length > 0)
      .flatMap((doc) => doc.history);

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Suggestion history fetched successfully.",
      data: results,
    });
  } catch (error) {
    console.error("Error fetching suggestion history:", error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
    });
  }
};

export default {
  getTodaySuggestions,
  addSuggestionNote,
  getSuggestionNoteHistory,
};
