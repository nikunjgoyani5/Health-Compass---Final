import Joi from "joi";

const nutrientSchema = Joi.object({
  name: Joi.string().required().label("Name"),
  amount: Joi.string().required().label("Amount"),
  dailyValuePercent: Joi.number().optional().label("Daily Value Percent"),
});

const healthEffectSchema = Joi.object({
  description: Joi.string().required().label("Description"),
  type: Joi.string()
    .valid("positive", "negative", "neutral")
    .default("neutral")
    .label("Type"),
});

const createIngredient = {
  body: Joi.object({
    name: Joi.string().required().label("Name"),
    categories: Joi.array().items(Joi.string()).default([]).label("Categories"),
    aliases: Joi.array().items(Joi.string()).default([]).label("Aliases"),
    description: Joi.string().allow("").optional().label("Description"),
    nutrients: Joi.array().items(nutrientSchema).default([]),
    healthEffects: Joi.array().items(healthEffectSchema).default([]),
    usage: Joi.string().allow("").optional().label("Usage"),
    foundInFoods: Joi.array().items(Joi.string()).default([]).label("Found In Foods"),
    sideEffects: Joi.array().items(Joi.string()).default([]).label("Side Effects"),
    precautions: Joi.array().items(Joi.string()).default([]),
    createdByAdmin: Joi.boolean().optional().label("Created By Admin"),
  }),
};

const updateIngredient = {
  body: Joi.object({
    name: Joi.string().label("Name"),
    categories: Joi.array().items(Joi.string()).label("Categories"),
    aliases: Joi.array().items(Joi.string()).label("Aliases"),
    description: Joi.string().allow("").label("Description"),
    nutrients: Joi.array().items(nutrientSchema).label("Nutrients"),
    healthEffects: Joi.array().items(healthEffectSchema).label("Health Effects"),
    usage: Joi.string().allow("").label("Usage"),
    foundInFoods: Joi.array().items(Joi.string()).label("Found In Foods"),
    sideEffects: Joi.array().items(Joi.string()).label("Side Effects"),
    precautions: Joi.array().items(Joi.string()).label("Precautions"),
    createdByAdmin: Joi.boolean().label("Created By Admin"),
  }).min(1),
};

export default {
  createIngredient,
  updateIngredient,
};
