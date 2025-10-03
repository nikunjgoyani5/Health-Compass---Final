import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import HealthLogModel from "../models/healthLog.model.js";
import helper from "../helper/common.helper.js";

// Add health log entry
const addHealthLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const { logDate, deviceType, latestLogData } = req.body;

    // 1. Check if health data already exists for the given user, date, and device
    const existingLog = await HealthLogModel.findOne({
      userId,
      logDate,
      deviceType,
    });

    if (existingLog) {
      // If data already exists, update the log history with the new entry
      existingLog.logHistory.push(latestLogData);
      existingLog.latestLogData = latestLogData; // Update the latest log data
      await existingLog.save(); // Save updated log

      return apiResponse({
        res,
        status: true,
        statusCode: StatusCodes.OK,
        message: "Health log updated successfully.",
        data: existingLog,
      });
    }

    // 2. If no existing log, create a new log entry
    const newHealthLog = new HealthLogModel({
      userId,
      logDate,
      deviceType,
      latestLogData,
      logHistory: [latestLogData], // First entry in the log history
    });

    await newHealthLog.save(); // Save the new health log

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: "Health log added successfully.",
      data: newHealthLog,
    });
  } catch (error) {
    console.error("Error adding health log:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

// Fetch health logs with optional filters and pagination
const fetchHealthLogs = async (req, res) => {
  try {
    const userId = req.user._id;
    const { logDate, page = 1, limit = 10 } = req.query;

    const filters = { userId };

    if (logDate) {
      // Parse logDate to match exact date
      const parsedDate = new Date(logDate);
      filters.logDate = {
        $gte: parsedDate.setHours(0, 0, 0, 0),
        $lt: parsedDate.setHours(23, 59, 59, 999),
      };
    }

    // Pagination calculation
    const skip = (page - 1) * limit;

    // Fetch logs with pagination, sorted by createdAt (latest first)
    const healthLogs = await HealthLogModel.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Count total logs
    const totalLogs = await HealthLogModel.countDocuments(filters);

    // Create pagination data
    const paginationData = helper.paginationDetails({
      limit: Number(limit),
      page: Number(page),
      totalItems: totalLogs,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Fetched health logs successfully.",
      data: healthLogs,
      pagination: paginationData,
    });
  } catch (error) {
    console.error("Error fetching health logs:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

export default {
  addHealthLog,
  fetchHealthLogs,
};
