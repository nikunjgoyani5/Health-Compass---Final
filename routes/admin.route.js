import express from "express";
import validate from "../middleware/validate.middleware.js";
import userValidation from "../validations/user.validation.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";
import controller from "../controllers/admin.controller.js";
import supplementTagValidation from "../validations/supplement-tag.validation.js";
import featureFlagsValidation from "../validations/feature-flags.validation.js";

const route = express.Router();

// ---------------------------------------------- Profile Management For Users ----------------------------------------------
route.get(
  "/get-all-user-profile",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getAllUserProfile
);
route.patch(
  "/assigned-role",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(userValidation.assignRoleToUser),
  controller.assignRoleToUser
);
route.delete(
  "/remove-role",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(userValidation.removeRoleFromUser),
  controller.removeRoleFromUser
);
route.patch(
  "/:id/block",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.SUPERADMIN,
  ]),
  validate(userValidation.blockAndUnblockUser),
  controller.blockAndUnblockUserProfile
);

// ---------------------------------------------- Get Schedule By Admin ----------------------------------------------
route.get(
  "/medicine-schedules",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getUserMedicineSchedules
);
route.get(
  "/vaccine-schedules",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getUserVaccineSchedules
);

// ---------------------------------------------- Doctor Availability By Admin ----------------------------------------------
route.get(
  "/doctor-availability",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getDoctorAvailability
);

// ---------------------------------------------- Appointments By Admin ----------------------------------------------
route.get(
  "/telemedicine-appointments",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getTelemedicineAppointments
);

// ---------------------------------------------- Medicine Usage By Admin ----------------------------------------------
route.get(
  "/medicine-usage",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getMedicineUsageByAdmin
);

// ---------------------------------------------- Vaccine Usage By Admin ----------------------------------------------
route.get(
  "/vaccine-usage",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getVaccineUsageByAdmin
);

// ---------------------------------------------- Supplement Tags By Admin ----------------------------------------------
route.post(
  "/create/supplement-tags",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(supplementTagValidation.createTag),
  controller.createSupplementTagByAdmin
);

route.get(
  /^\/supplement-tags\/list(?:\/([^\/]+))?$/,
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  (req, res, next) => {
    req.params.id = req.params[0]; // Manually set `id` if present
    controller.getAllSupplementTagsByAdmin(req, res, next);
  }
);

route.put(
  "/update/supplement-tags/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(supplementTagValidation.updateTag),
  controller.updateSupplementTagByAdmin
);

route.delete(
  "/delete/supplement-tags/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(supplementTagValidation.deleteTag),
  controller.deleteSupplementTagByAdmin
);

// -------------------------------------------------- Feature Flags By Admin ----------------------------------------------
route.get(
  "/features",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.SUPERADMIN,
  ]),
  controller.listFeatureFlags
);

route.post(
  "/features",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.SUPERADMIN,
  ]),
  validate(featureFlagsValidation.setFeatureFlag),
  controller.setFeatureFlag
);

route.patch(
  "/features/:id/enable-disable",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.SUPERADMIN,
  ]),
  controller.enableDisableFlag
);

route.patch(
  "/block-unblock-caregiver",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.SUPERADMIN,
  ]),
  validate(userValidation.blockUnblockCaregiverByAdmin),
  controller.blockUnblockCaregiverByAdmin
);

// --------------------------- Get User Dashboard By Admin ------------------------------------
route.get(
  "/users/:userId/dashboard",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.SUPERADMIN,
  ]),
  controller.getUserDashboard
);

export default route;
