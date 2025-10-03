import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import FeatureFlagModel from "../models/feature-flags.model.js";

export default function requireFeatures(...requiredKeys) {
  return async (req, res, next) => {
    try {
      const flags = await FeatureFlagModel.find({
        key: { $in: requiredKeys },
      }).lean();

      const flagMap = {};
      flags.forEach((flag) => {
        flagMap[flag.key] = flag.value;
      });

      const missingOrDisabled = requiredKeys.filter(
        (key) => flagMap[key] !== true
      );

      if (missingOrDisabled.length > 0) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.FORBIDDEN,
          message: `Access denied. Required features not enabled: ${missingOrDisabled.join(
            ", "
          )}`,
        });
      }

      next();
    } catch (error) {
      console.error("Error checking feature flags:", error);
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        message: "Internal server error during feature verification",
      });
    }
  };
}
