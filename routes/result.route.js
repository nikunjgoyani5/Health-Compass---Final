import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/result.controller.js";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/result.validation.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

route.post(
  "/:quizId",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.USER]),
  validate(validation.submitAnswer),
  controller.submitAnswer
);

route.get("/", verifyToken, controller.getResult);

export default route;
