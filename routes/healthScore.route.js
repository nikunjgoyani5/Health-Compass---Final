import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/healthScore.controller.js";
import validation from "../validations/healthScore.validation.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

route.post(
  "/add",
  verifyToken,
  validate(validation.healthScoreValidation),
  controller.addHealthScore
);

route.get("/list", verifyToken, controller.getHealthScore);

export default route;
