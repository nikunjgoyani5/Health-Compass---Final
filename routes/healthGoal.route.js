import express from "express";
import validate from "../middleware/validate.middleware.js";
import healthGoalValidation from "../validations/healthGoal.validation.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";
import controller from "../controllers/healthGoal.controller.js";

const route = express.Router();

// Create or update health goal
route.post(
  "/save",
  verifyToken,
  // checkPermission([enumConfig.ROLE.ADMIN]), // unComment this line if you want to restrict this route to admin only
  validate(healthGoalValidation.saveHealthGoal),
  controller.createHealthGoal
);

route.get(
  "/get",
  verifyToken,
  // checkPermission([enumConfig.ROLE.ADMIN]), // unComment this line if you want to restrict this route to admin only
  controller.getHealthGoal
);

export default route;
