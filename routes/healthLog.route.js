import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/healthLog.controller.js";
import validation from "../validations/healthLog.validation.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

route.post(
  "/add",
  verifyToken,
  validate(validation.addHealthLog),
  controller.addHealthLog
);

route.get("/", verifyToken, controller.fetchHealthLogs);

export default route;
