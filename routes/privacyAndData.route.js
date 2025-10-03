import express from "express";
import validate from "../middleware/validate.middleware.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/privacyAndData.controller.js";
import privacyAndDataValidation from "../validations/privacyAndData.validation.js";

const route = express.Router();

route.patch(
  "/update",
  verifyToken,
  validate(privacyAndDataValidation.savePrivacySetting),
  controller.updatePrivacySetting
);

route.get("/get", verifyToken, controller.getPrivacySetting);

export default route;
