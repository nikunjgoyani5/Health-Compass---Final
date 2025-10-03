import { StatusCodes } from "http-status-codes";
import { RateLimiterMemory } from "rate-limiter-flexible";
import {apiResponse} from "../helper/api-response.helper.js";

const limiter = new RateLimiterMemory({
  points: 50, // 50 requests
  duration: 60, // per 60 seconds per IP
});

const rateLimiter = (req, res, next) => {
  limiter
    .consume(req.ip)
    .then(() => next())
    .catch(() =>
      apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.TOO_MANY_REQUESTS,
        message: "You're searching a bit too quickly. Please wait a moment before trying again.",
        data: null,
      }
    )
  );
};

export default rateLimiter;
