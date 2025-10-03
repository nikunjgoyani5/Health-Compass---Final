import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const verifyToken = {
  body: Joi.object().keys({
    token: Joi.string().required().label("Token"),
  }),
};

const registerByEmail = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().required().label("Password"),
    fullName: Joi.string().required().label("Fullname"),
    role: Joi.array().label("Role"),
  }),
};

const verifyEmailOtp = {
  body: Joi.object().keys({
    otp: Joi.number().strict().required().label("OTP"),
    email: Joi.string().email().required().label("Email"),
    role: Joi.array().label("Role"),
  }),
};

const resendEmailOtp = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email"),
    role: Joi.array().label("Role"),
  }),
};

const loginByEmail = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().required().label("Password"),
    role: Joi.array().label("Role"),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email"),
    role: Joi.array().label("Role"),
  }),
};

const resetPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email"),
    role: Joi.array().label("Role"),
    newPassword: Joi.string().required().label("New password"),
    conformNewPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .label("Conform password"),
  }),
};

const loginByGoogle = {
  body: Joi.object({
    token: Joi.string().required().label("Token"),
    role: Joi.array().label("Role"),
  }),
};

const loginByApple = {
  body: Joi.object({
    token: Joi.string().required().label("Token"),
    role: Joi.array().label("Role"),
  }),
};

const verifyRecaptcha = {
  body: Joi.object().keys({
    token: Joi.string().required().messages({
      "string.base": "Recaptcha token must be a string",
      "any.required": "Recaptcha token is required",
      "string.empty": "Recaptcha token cannot be empty",
    }),
  }),
};

export default {
  verifyToken,
  registerByEmail,
  loginByEmail,
  forgotPassword,
  resendEmailOtp,
  verifyEmailOtp,
  resetPassword,
  loginByGoogle,
  loginByApple,
  verifyRecaptcha,
};
