import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import notificationController from "../controllers/notification.controller.js";

const router = express.Router();

router.get("/", verifyToken, notificationController.getNotifications);

export default router;
