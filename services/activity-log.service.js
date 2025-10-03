import ActivityLog from "../models/activity-log.model.js";
import UserModel from "../models/user.model.js";
import helper from "../helper/common.helper.js";

/**
 * Create a new activity log entry
 */
const createActivity = async (data) => {
  try {
    let {
      userId,
      email,
      activityType,
      activityCategory,
      description,
      status,
      error,
      userRole = "user",
    } = data;

    // Resolve userId from email or ID
    userId = await helper.ensureUserId(userId, email);
    const user = await UserModel.findById(userId);
    if (!user) throw new Error("User not found");

    email = email || user.email;
    userRole = Array.isArray(user.role) ? user.role : [user.role];

    // Structure the log entry
    const logData = {
      userId,
      userRole,
      activityType,
      activityCategory,
      description,
      status,
    };

    if (error && typeof error === "object") {
      logData.error = {
        message: error.message || "Unknown error",
        stack: error.stack || "",
        code: error.code || "",
        details: error.details || {},
      };
    }

    const activity = await ActivityLog.create(logData);
    return activity;
  } catch (err) {
    console.error("ActivityLog Error:", err.message);
    try {
      await ActivityLog.create({
        activityType: "SYSTEM_ERROR",
        activityCategory: "system",
        description: "Failed to log user activity",
        status: "ERROR",
        error: {
          message: err.message,
          stack: err.stack || "",
          code: err.code || "ACTIVITY_LOG_ERROR",
          details: { originalInput: data },
        },
      });
    } catch (finalErr) {
      console.error("Failed to log system-level error:", finalErr.message);
    }
  }
};

/**
 * Get all activity logs for a user
 */
const getActivityByUserId = async (userId) => {
  return await ActivityLog.find({ userId }).sort({ createdAt: -1 });
};

/**
 * Get logs by category for a user
 */
const getActivityByCategory = async (userId, activityCategory) => {
  return await ActivityLog.find({ userId, activityCategory }).sort({
    createdAt: -1,
  });
};

export default {
  createActivity,
  getActivityByUserId,
  getActivityByCategory,
};
