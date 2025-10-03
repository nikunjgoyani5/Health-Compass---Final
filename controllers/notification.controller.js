import mongoose from "mongoose";
import { apiResponse } from "../helper/api-response.helper.js";
import Notification from "../models/notification.model.js";
import { StatusCodes } from "http-status-codes";

const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, notificationId } = req.query;

    if (notificationId) {
      await Notification.updateOne(
        {
          userId,
          "notifications._id": new mongoose.Types.ObjectId(notificationId),
        },
        { $set: { "notifications.$.isRead": true } }
      );
    } else {
      await Notification.updateOne(
        { userId },
        { $set: { "notifications.$[].isRead": true } }
      );
    }

    const updatedUserNotifications = await Notification.findOne({
      userId,
    }).select("notifications");

    if (updatedUserNotifications) {
      updatedUserNotifications.notifications.sort(
        (a, b) => b.createdAt - a.createdAt
      );
    }

    let filteredNotifications = updatedUserNotifications?.notifications || [];

    if (type) {
      filteredNotifications = filteredNotifications.filter(
        (notification) =>
          notification.type?.toLowerCase() === type.toLowerCase()
      );
    }

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      message: "Notifications retrieved successfully",
      status: true,
      data: filteredNotifications,
    });
  } catch (error) {
    console.error("Error retrieving notifications:", error);
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "An error occurred while retrieving notifications",
      status: false,
    });
  }
};

export default {
  getNotifications,
};
