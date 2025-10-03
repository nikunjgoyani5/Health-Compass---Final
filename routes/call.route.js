import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/call.controller.js";
import validation from "../validations/call.validation.js";
import validate from "../middleware/validate.middleware.js";

const route = express.Router();

route.post(
  "/twilio/call",
  verifyToken,
  validate(validation.validateTwilioCall),
  controller.incomingCall
);

route.post("/twilio/call/forward", verifyToken, controller.callForwarding);
route.post("/webrtc/connect", verifyToken, controller.webRTCConnect);

export default route;
