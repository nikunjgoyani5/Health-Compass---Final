import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/onboarding.controller.js";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/onboarding.validation.js";

const route = express.Router();

route.post(
  "/",
  verifyToken,
  validate(validation.onboardingSchema),
  controller.createOnboarding
);

route.get("/", verifyToken, controller.getOnboarding);

route.patch(
  "/",
  verifyToken,
  validate(validation.onboardingSchema),
  controller.updateOnboarding
);

export default route;
