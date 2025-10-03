import express from "express";
import { fillupMentalHealth } from "../controllers/mentalHealth.controller.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { validateFillUpMentalHealth } from "../validations/mentalHealth.validation.js";

const route = express.Router();

route.post(
  "/",
  verifyToken,
  validate(validateFillUpMentalHealth),
  fillupMentalHealth
);

export default route;
