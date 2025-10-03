import express from "express";
import controller from "../controllers/medicine.schedual.controller.js";
import validation from "../validations/medicine.schedual.validation.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

route.get("/list", verifyToken, controller.getScheduleByUser);

route.get("/:scheduleId/dose-logs", verifyToken, controller.getDoseLogs);

route.get("/current-date-logs", verifyToken, controller.getTodaysDoses);

route.get("/get-doses-by-date", verifyToken, controller.getDosesByDate);

route.get("/dose-quantity", verifyToken, controller.getAllDosesWithQuantity);

route.get("/report", verifyToken, controller.getMonthlyScheduleReport);

route.post("/", verifyToken, validate(validation.createMedicineSchedule), controller.createSchedule);

route.patch("/:id/update", verifyToken, validate(validation.updateMedicineSchedule), controller.updateMedicineSchedule);

route.post("/by-bot", verifyToken, controller.createMedicineScheduleByBot )

route.patch("/dose-status/:scheduleId", verifyToken, validate(validation.updateDoseStatus), controller.updateDoseStatus);

route.patch("/:scheduleId/add-quantity", verifyToken, validate(validation.addMedicineQuantity), controller.addMedicineQuantity);

route.patch("/:id/status", verifyToken, validate(validation.updateStatus), controller.updateStatus)

route.delete("/:id", verifyToken, controller.deleteMedicineSchedule);

export default route;
