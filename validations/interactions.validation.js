import Joi from "joi";

const checkInteractions = {
  body: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          type: Joi.string()
            .valid("medicine", "supplement")
            .required()
            .label("Item Type"),
          id: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .label("Item ID")
            .messages({
              "string.pattern.base": "Item ID must be a 24-character hexadecimal string.",
              "any.required": "Item ID is required."
            }),
        })
      )
      .min(2)
      .required()
      .label("Items")
      .messages({
        "array.min": "At least two items are required to check interactions.",
        "any.required": "Items array is required.",
      }),
  }),
};

export default {
  checkInteractions,
};
