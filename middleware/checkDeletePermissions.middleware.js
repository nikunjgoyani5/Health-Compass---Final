import mongoose  from "mongoose";
import { StatusCodes } from "http-status-codes";
import User from "../models/user.model.js";
import { apiResponse } from "../helper/api-response.helper.js";

const checkDeletePermissions = async (req, res, next) => {
  const requestingUser = req.user;
  const targetUserId = req.params.targetUserId;

  try {
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid target user ID",
        data: null,
      });
    }

    const targetUser = await User.findById(targetUserId).lean();

    if (!targetUser) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Target user not found",
        data: null,
      });
    }

    // Allow self-deletion
    if (requestingUser._id.toString() === targetUserId) {
      return next();
    }

    // Normalize roles
    const requesterRoles = Array.isArray(requestingUser.role)
      ? requestingUser.role
      : [requestingUser.role];

    const targetRoles = Array.isArray(targetUser.role)
      ? targetUser.role
      : [targetUser.role];

    // Permissions map
    const allowedRoles = {
      admin: ["doctor", "user"],
      superadmin: ["admin", "doctor", "user"],
    };

    // Determine highest privilege of requester
    const effectiveRole = requesterRoles.includes("superadmin")
      ? "superadmin"
      : requesterRoles.includes("admin")
      ? "admin"
      : null;

    if (!effectiveRole) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "Only admin or superadmin can delete other users.",
        data: null,
      });
    }

    // Check if any target role is deletable by the effectiveRole
    const canDelete = targetRoles.some((targetRole) =>
      allowedRoles[effectiveRole].includes(targetRole.toLowerCase())
    );

    if (!canDelete) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You do not have permission to delete this user.",
        data: null,
      });
    }

    req.user.targetUser = targetUser;
    req.user.targetUserId = targetUserId;
    next();
  } catch (error) {
    console.error("❌ Error in checkDeletePermissions:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

export default checkDeletePermissions;
