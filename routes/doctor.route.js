import multer from "multer";
import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/doctor.controller.js";
import validation from "../validations/doctor.validation.js";
import validate from "../middleware/validate.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

route.post(
  "/add",
  verifyToken,
  upload.single("profileImage"),
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(validation.addDoctor),
  controller.addDoctor
);

route.get("/details", verifyToken, controller.getDoctorDetail);

route.get(
  "/:doctorId/appointments",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.DOCTOR,
  ]),
  controller.getAppointmentsByDoctorId
);

route.patch(
  "/details/:id",
  upload.single("profileImage"),
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.DOCTOR,
  ]),
  validate(validation.updateDoctorDetails),
  controller.updateDoctorDetail
);

export default route;
