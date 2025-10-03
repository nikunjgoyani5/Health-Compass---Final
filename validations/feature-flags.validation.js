import Joi from "joi";

const setFeatureFlag = {
  body: Joi.object().keys({
    key: Joi.string().required().label("Key"),
    value: Joi.boolean().required().label("Value").messages({
      "any.required": "Feature flag value is required.",
      "boolean.base": "Feature flag value must be a boolean.",
    }),
    description: Joi.string().allow("").optional().label("Description"),
  }),
};

export default {
  setFeatureFlag,
};
