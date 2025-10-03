import validate from "../middleware/validate.middleware.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import caregiverController from "../controllers/caregiver-notes.controller.js";
import caregiverValidation from "../validations/caregiver-notes.validation.js";
import express from "express";

const route = express.Router();

route.post(
  "/add",
  verifyToken,
  validate(caregiverValidation.addNote),
  caregiverController.addCaregiverNote
);
route.patch(
  "/:noteId/update",
  verifyToken,
  validate(caregiverValidation.addNote),
  caregiverController.updateCaregiverNote
);
route.delete(
  "/:noteId/delete",
  verifyToken,
  caregiverController.deleteCaregiverNote
);
route.get("/get", verifyToken, caregiverController.getCaregiverNotesForMe);
route.get("/get-sent", verifyToken, caregiverController.getCaregiverNotesISent);

export default route;
