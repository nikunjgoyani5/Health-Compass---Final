import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";

const errorHandler = (error, req, res, next) => {
  // If a response has already been sent for this request, do not attempt to send another
  if (res.headersSent) {
    try {
      console.warn("Response already sent. Skipping error handler:", error?.message || error);
    } catch (_) {}
    return;
  }

  if (error?.response?.data) {
    return apiResponse({
      res,
      statusCode: error.response.status,
      message: error.response.data.message,
    });
  }

  return apiResponse({
    res,
    statusCode: error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    message: error?.message,
  });
};

export default errorHandler;
