import Joi from "joi";

const supportRequest = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email").messages({
      "any.required": "Email is required",
      "string.empty": "Email cannot be empty",
      "string.base": "Email must be a string",
      "string.email": "Enter a valid email address",
    }),
    subject: Joi.string().required().label("Subject").messages({
      "any.required": "Subject is required",
      "string.empty": "Subject cannot be empty",
      "string.base": "Subject must be a string",
    }),
    description: Joi.string().required().label("Description").messages({
      "any.required": "Description is required",
      "string.empty": "Description cannot be empty",
      "string.base": "Description must be a string",
    }),
  }),
};

export default {
  supportRequest,
};
