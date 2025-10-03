import validate from "../middleware/validate.middleware.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import authController from "../controllers/auth.controller.js";
import authValidation from "../validations/auth.validation.js";
import express from "express";

const route = express.Router();

route.post("/verify/token", verifyToken, authController.verifyToken);

route.post(
  "/register-by-email",
  validate(authValidation.registerByEmail),
  authController.registerByEmail
);

route.post(
  "/verify-email-otp",
  validate(authValidation.verifyEmailOtp),
  authController.verifyEmailOtp
);

route.post(
  "/resend-email-otp",
  validate(authValidation.resendEmailOtp),
  authController.resendEmailOtp
);

route.post(
  "/login-by-email",
  validate(authValidation.loginByEmail),
  authController.loginByEmail
);

route.post(
  "/forgot-password",
  validate(authValidation.forgotPassword),
  authController.forgotPassword
);

route.post(
  "/google-login",
  validate(authValidation.loginByGoogle),
  authController.loginByGoogle
);

route.post(
  "/apple-login",
  validate(authValidation.loginByApple),
  authController.loginByApple
);

route.post(
  "/reset-password",
  validate(authValidation.resetPassword),
  authController.resetPassword
);

route.post(
  "/verify-recaptcha",
  validate(authValidation.verifyRecaptcha),
  authController.verifyRecaptcha
);

export default route;
