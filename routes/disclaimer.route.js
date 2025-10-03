import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import * as controller from "../controllers/disclaimer.controller.js";
import validation from "../validations/disclaimer.validation.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

// Only 5 APIs - All protected (authentication required)
route.post(
  "/",
  verifyToken,
  validate(validation.createDisclaimer),
  controller.createDisclaimer
);

route.get(
  "/",
  verifyToken,
  validate(validation.getAllDisclaimers),
  controller.getAllDisclaimers
);

route.get(
  "/:id",
  verifyToken,
  validate(validation.getDisclaimerById),
  controller.getDisclaimerById
);

route.put(
  "/:id",
  verifyToken,
  validate(validation.updateDisclaimer),
  controller.updateDisclaimer
);

route.delete(
  "/:id",
  verifyToken,
  validate(validation.deleteDisclaimer),
  controller.deleteDisclaimer
);

export default route;