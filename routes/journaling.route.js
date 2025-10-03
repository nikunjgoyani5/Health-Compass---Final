import validate from "../middleware/validate.middleware.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import healthLogController from "../controllers/journaling.controller.js";
import healthSuggestionController from "../controllers/healthLogSuggestion.controller.js";
import validation from "../validations/journaling.validation.js";
import express from "express";

const route = express.Router();

// CRUD operations for daily health logs / journal entries
route.post(
  "/add",
  verifyToken,
  validate(validation.healthNoteValidation),
  healthLogController.createJournalingEntry
);
route.patch(
  "/update",
  verifyToken,
  validate(validation.healthNoteValidation),
  healthLogController.updateJournalingEntry
);
route.delete(
  "/:logId/delete",
  verifyToken,
  healthLogController.deleteJournalingEntry
);
route.get("/get", verifyToken, healthLogController.getUserJournalingEntries);

// For analytics and calendar view
route.post(
  "/get-calender",
  verifyToken,
  healthLogController.getJournalingNotesStatusCalendar
);
route.post(
  "/get-analytics",
  verifyToken,
  healthLogController.getJournalingAnalytics
);

// AI recommendations
route.get(
  "/get-today-suggestion",
  verifyToken,
  healthSuggestionController.getTodaySuggestions
);
route.get(
  "/get-suggestion-note-history",
  verifyToken,
  healthSuggestionController.getSuggestionNoteHistory
);
route.post(
  "/add-suggestion-note",
  verifyToken,
  validate(validation.addSuggestionNote),
  healthSuggestionController.addSuggestionNote
);

export default route;
