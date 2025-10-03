import multer from "multer";
import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/quiz.controller.js";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/quiz.validation.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

route.post(
  "/",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  upload.single("image"),
  validate(validation.createQuiz),
  controller.createQuiz
);

route.get(
  "/admin",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getQuizForAdmin
);

route.get("/list", verifyToken, controller.getUserQuizzes);

route.patch(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  upload.single("image"),
  validate(validation.updateQuiz),
  controller.updateQuiz
);

route.delete(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.deleteQuiz
);

export default route;
