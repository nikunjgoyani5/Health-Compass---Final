import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/caregiver.controller.js";
import adminController from "../controllers/admin.controller.js";

const route = express.Router();

route.get("/my-caregivers", verifyToken, controller.getMyCaregivers);

route.get("/i-care-for", verifyToken, controller.getICareFor);

route.get("/:userId/dashboard", verifyToken, adminController.getUserDashboard);

export default route;
