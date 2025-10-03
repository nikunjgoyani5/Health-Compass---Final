import Joi from "joi";

const createTag = {
  body: Joi.object().keys({
    name: Joi.string().required().label("Name").messages({
      "string.empty": "Name is required",
      "any.required": "Name is required",
    }),
    description: Joi.string().optional().label("Description"),
    category: Joi.string().optional().label("Category"),
    color: Joi.string().optional().label("Color"),
    active: Joi.boolean().optional().label("Active"),
  }),
};

const updateTag = {
  body: Joi.object({
    description: Joi.string().optional().label("Description"),
    name: Joi.string().optional().label("Name"),
    category: Joi.string().optional().label("Category"),
    color: Joi.string().optional().label("Color"),
    active: Joi.boolean().optional().label("Active"),
  }),
};

const deleteTag = {
  body: Joi.object({
    isPermanentDelete: Joi.boolean().required().label("Permanent Delete").messages({
      "any.required": "Permanent delete flag is required",
    }),
  }),
};

export default {
  createTag,
  updateTag,
  deleteTag,
};
