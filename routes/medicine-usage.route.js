import express from "express";
import controller from "../controllers/medicine-usage.controller.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";

const route = express.Router();

route.get("/", verifyToken, controller.getMedicineUsage);

export default route;
