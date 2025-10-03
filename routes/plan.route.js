import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/plan.controller.js";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/plan.validation.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

route.post(
  "/",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(validation.createPlan),
  controller.createPlan
);

route.get("/list", verifyToken, controller.getPlan);

route.patch(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(validation.updatePlan),
  controller.updatePlan
);

route.delete(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.deletePlan
);

export default route;
