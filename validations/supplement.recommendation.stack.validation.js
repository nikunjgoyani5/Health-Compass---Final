import Joi from "joi";
import joiObjectId from "joi-objectid";

Joi.objectId = joiObjectId(Joi);

const addStack = {
  body: Joi.object().keys({
    userId: Joi.objectId().required().label("User ID").messages({
      "string.pattern.name": "Invalid User ID provided",
      "any.required": "User ID is required",
    }),
    supplementRecommendationId: Joi.objectId().required().label("Supplement Recommendation ID").messages({
      "string.pattern.name": "Invalid Supplement recommendation ID provided",
      "any.required": "Supplement recommendation ID is required",
    }),
  }),
};

export default {
  addStack,
};
