import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/telemedicine.controller.js";
import validation from "../validations/telemedicine.validation.js";
import validate from "../middleware/validate.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

route.post(
  "/schedule",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.USER,
    enumConfig.userRoleEnum.DOCTOR,
  ]),
  validate(validation.createTelemedicineDetail),
  controller.createTelemedicineDetail
);

route.get("/", verifyToken, controller.getTelemedicineDetail);

route.get(
  "/doctor-availability",
  verifyToken,
  controller.getDoctorAvailabilityByDate
);

route.patch(
  "/:id",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.USER,
    enumConfig.userRoleEnum.DOCTOR,
  ]),
  validate(validation.updateTelemedicineDetail),
  controller.updateTelemedicineDetail
);

route.patch(
  "/:id/status",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.DOCTOR,
    enumConfig.userRoleEnum.USER,
  ]),
  validate(validation.updateStatus),
  controller.updateStatus
);

route.delete(
  "/:id",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.USER,
    enumConfig.userRoleEnum.DOCTOR,
  ]),
  controller.deleteTelemedicineDetail
);

export default route;
