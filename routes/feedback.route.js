import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/feedback.controller.js";
import validation from "../validations/feedback.validation.js";
import validate from "../middleware/validate.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

route.post(
  "/",
  verifyToken,
  validate(validation.createFeedback),
  controller.createFeedback
);

route.get(
  "/",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getFeedbacks
);

route.delete(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.deleteFeedback
);

export default route;
