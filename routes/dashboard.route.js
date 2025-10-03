import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/dashboard.controller.js";
import {
  logMeal,
  lookupFoodByBarcode,
} from "../controllers/scan.controller.js";

const route = express.Router();

route.get("/", verifyToken, controller.getDashboard);
route.post("/scan", verifyToken, lookupFoodByBarcode);
route.post("/log-meal", verifyToken, logMeal);

export default route;
