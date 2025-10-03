import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import userValidation from "../validations/user.validation.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";
import controller from "../controllers/superadmin.controller.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

// ---------------------------------------------- Profile Management For Admin ----------------------------------------------
route.get(
  "/get-admins",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.SUPERADMIN]),
  controller.getAdmins
);

route.patch(
  "/update-status-approved-or-rejected",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.SUPERADMIN]),
  validate(userValidation.approveAndRejectValidation),
  controller.approveAndRejectAdminUser
);

route.patch(
  "/block-unblock-admin",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.SUPERADMIN]),
  validate(userValidation.blockAndUnblockAdminValidation),
  controller.blockAndUnblockAdmin
)

export default route;
