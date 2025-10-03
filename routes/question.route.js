import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/question.controller.js";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/question.validation.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

route.post(
  "/",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(validation.createQuestion),
  controller.createQuestion
);

route.get("/list", verifyToken, controller.getQuestion);

route.patch(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(validation.updateQuestion),
  controller.updateQuestion
);

route.delete(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.deleteQuestion
);

export default route;
