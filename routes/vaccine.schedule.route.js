import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/vaccine.schedule.controller.js";
import validation from "../validations/vaccine.schedule.validation.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

route.get("/", verifyToken, controller.getVaccineSchedule);
route.get("/by-date", verifyToken, controller.getVaccineScheduleByDate);
route.get(
  "/current-date-logs",
  verifyToken,
  controller.getTodayVaccineSchedules
);

route.delete("/:id", verifyToken, controller.deleteVaccineSchedule);

route.post(
  "/",
  verifyToken,
  validate(validation.scheduleVaccine),
  controller.scheduleVaccine
);

route.post("/by-bot", verifyToken, controller.scheduleVaccineByBot);

route.patch(
  "/:id",
  verifyToken,
  validate(validation.updateSchedule),
  controller.updateVaccineSchedule
);

route.patch(
  "/:id/status",
  verifyToken,
  validate(validation.updateScheduleStatus),
  controller.updateScheduleStatus
);

export default route;
