import enumConfig from "../config/enum.config.js";
import { apiResponse } from "../helper/api-response.helper.js";
import { StatusCodes } from "http-status-codes";

/**
 * Check permissions for a given user and return the permissions
 */
export const checkPermission = (allowedRoles) => {
  return (req, res, next) => {
    const userRoles = req.user.role || [];

    if (
      userRoles.includes(enumConfig.userRoleEnum.SUPERADMIN) &&
      allowedRoles.includes(enumConfig.userRoleEnum.ADMIN)
    ) {
      return next();
    }

    const hasPermission = userRoles.some((role) => allowedRoles.includes(role));
    if (hasPermission) {
      next();
    } else {
      console.log("Unauthorized Access Attempted");
      return apiResponse({
        res,
        status: false,
        message: "You are not authorized to perform this action.",
        statusCode: StatusCodes.UNAUTHORIZED,
      });
    }
  };
};
