import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/supplement.recommendation.stack.validation.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";
import controller from "../controllers/supplement.recommendation.stack.controller.js";

const route = express.Router();

route.post(
  "/add",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.USER]),
  validate(validation.addStack),
  controller.addToStack
);

route.get(
  "/get",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.USER]),
  controller.getStack
);

route.post(
  "/remove",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.USER]),
  controller.removeFromStack
);

export default route;
