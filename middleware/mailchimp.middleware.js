import { StatusCodes } from "http-status-codes";
import config from "../config/config.js";
import { apiResponse } from "../helper/api-response.helper.js";

// Email validation middleware
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: "Invalid email format",
    });
  }
  next();
};

// Basic token check for webhook or internal use
const checkBasicToken = (req, res, next) => {
  const token = req.headers["basic_token"];
  if (!token || token !== config.mailchimp.basicToken) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.UNAUTHORIZED,
      message: "Invalid Basic Token",
    });
  }
  next();
};

// Webhook secret check (for query param)
const checkWebhookSecret = (req, res, next) => {
  const secret = req.query.secret;
  if (!secret || secret !== config.mailchimp.webhookSecret) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.UNAUTHORIZED,
      message: "Invalid webhook secret",
    });
  }
  next();
};

export default {
  validateEmail,
  checkBasicToken,
  checkWebhookSecret,
};
