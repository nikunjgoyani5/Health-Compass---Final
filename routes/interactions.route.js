import express from "express";
import interactionsController from "../controllers/interactions.controller.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import validate from "../middleware/validate.middleware.js";
import interactionsValidation from "../validations/interactions.validation.js";

const route = express.Router();

route.post(
  "/check",
  verifyToken,
  validate(interactionsValidation.checkInteractions),
  interactionsController.checkInteractions
);

route.get("/history", verifyToken, interactionsController.getInteractionHistory);

export default route;
