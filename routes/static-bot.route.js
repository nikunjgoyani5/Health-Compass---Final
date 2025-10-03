import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import healthController from "../controllers/static-bot.controller.js";
import validate from "../middleware/validate.middleware.js";
import healthValidation from "../validations/static-bot.validation.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

route.post(
  "/module",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(healthValidation.createHealthCheck),
  healthController.addModule
);

route.post(
  "/:moduleId/prompts",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(healthValidation.addPrompts),
  healthController.addPrompts
);

route.get("/:moduleId", verifyToken, healthController.getPrompts);

route.delete(
  "/:moduleId",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  healthController.deleteRecords
);

route.patch(
  "/:moduleId",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(healthValidation.updateData),
  healthController.updateData
);

route.post(
  "/ask",
  verifyToken,
  validate(healthValidation.askQuestion),
  healthController.askQuestion
);

export default route;
