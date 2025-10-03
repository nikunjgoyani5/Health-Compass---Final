import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/availability.controller.js";
import validation from "../validations/availability.validation.js";
import validate from "../middleware/validate.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

route.get("/", verifyToken, controller.getAvailability);

route.patch(
  "/:id",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.DOCTOR,
  ]),
  validate(validation.updateAvailability),
  controller.updateAvailability
);

export default route;
