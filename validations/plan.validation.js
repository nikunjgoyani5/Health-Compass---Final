import Joi from "joi";

const priceSchema = Joi.object({
  label: Joi.string().required().label("Label"),
  stripePriceId: Joi.string().required().label("Stripe Price ID"),
  interval: Joi.string().valid("day", "week", "month", "year").required().label("Interval"),
  intervalCount: Joi.number().integer().min(1).default(1).label("Interval Count"),
  currency: Joi.string().uppercase().length(3).default("USD").label("Currency"),
  amountCents: Joi.number().min(0).required().label("Amount (Cents)"),
  isPrimary: Joi.boolean().default(false).label("Primary"),
  trialDays: Joi.number().integer().label("Trial Days"),
  trialDescription: Joi.string().allow("", null).label("Trial Description"),
  tag: Joi.string().allow("", null).label("Tag"),
  discountType: Joi.string()
    .valid("percentage", "flat")
    .allow(null)
    .default(null)
    .label("Discount Type"),
  discountValue: Joi.number().min(0).default(0).label("Discount Value"),
  discountDescription: Joi.string().allow("", null).label("Discount Description"),
  discountDurationMonths: Joi.number().integer().min(0).default(0).label("Discount Duration (Months)"),
});

const toggleSchema = Joi.object({
  access_name: Joi.string().required().label("Access Name"),
  isIncluded: Joi.boolean().default(false).label("Is Included"),
});

const createPlan = {
  body: Joi.object().keys({
    name: Joi.string().required().label("Name"),
    badge: Joi.string().allow("").label("Badge"), // optional
    rank: Joi.number().integer().min(0).default(0).label("Rank"),
    isActive: Joi.boolean().default(false).label("Is Active"),

    access: Joi.array().items(toggleSchema).required().label("Access"),
    includes: Joi.array()
      .items(
        Joi.object({
          include_name: Joi.string().required().label("Include Name"),
          isIncluded: Joi.boolean().default(false).label("Is Included"),
        })
      )
      .required()
      .label("Includes"),
    adds: Joi.array()
      .items(
        Joi.object({
          add_name: Joi.string().required().label("Add Name"),
          isIncluded: Joi.boolean().default(false).label("Is Included"),
        })
      )
      .required()
      .label("Adds"),
    features: Joi.object()
      .pattern(
        Joi.string(),
        Joi.alternatives().try(Joi.boolean(), Joi.number(), Joi.string())
      )
      .required()
      .label("Features"),
    prices: Joi.array().items(priceSchema).min(1).required().label("Prices"), // At least 1 price
    highlights: Joi.array().items(Joi.string()).default([]).label("Highlights"),
  }),
};

const updatePlan = {
  body: Joi.object().keys({
    name: Joi.string().optional().label("Name"),
    slug: Joi.string().lowercase().optional().label("Slug"),
    badge: Joi.string().allow("").optional().label("Badge"),
    rank: Joi.number().integer().min(0).optional().label("Rank"),
    isActive: Joi.boolean().optional().label("Is Active"),

    access: Joi.array()
      .items(
        Joi.object({
          access_name: Joi.string().required().label("Access Name"),
          isIncluded: Joi.boolean().default(false).label("Is Included"),
        })
      )
      .optional()
      .label("Access"),

    includes: Joi.array()
      .items(
        Joi.object({
          include_name: Joi.string().required().label("Include Name"),
          isIncluded: Joi.boolean().default(false).label("Is Included"),
        })
      )
      .optional()
      .label("Includes"),

    adds: Joi.array()
      .items(
        Joi.object({
          add_name: Joi.string().required().label("Add Name"),
          isIncluded: Joi.boolean().default(false).label("Is Included"),
        })
      )
      .optional()
      .label("Adds"),

    features: Joi.object()
      .pattern(
        Joi.string(),
        Joi.alternatives().try(Joi.boolean(), Joi.number(), Joi.string()).label("Features")
      )
      .optional()
      .label("Features"),

    prices: Joi.array()
      .items(
        Joi.object({
          label: Joi.string().required().label("Label"),
          tag: Joi.string().allow("", null),
          stripePriceId: Joi.string().required().label("Stripe Price ID"),
          interval: Joi.string()
            .valid("day", "week", "month", "year")
            .required()
            .label("Interval"),
          intervalCount: Joi.number().integer().min(1).default(1).label("Interval Count"),
          currency: Joi.string().uppercase().length(3).default("USD"),
          amountCents: Joi.number().required().label("Amount (Cents)"),
          isPrimary: Joi.boolean().default(false).label("Is Primary"),
          trialDays: Joi.number().integer().label("Trial Days"),
          trialDescription: Joi.string().allow("", null),
          discountType: Joi.string()
            .valid("percentage", "flat")
            .allow(null)
            .default(null)
            .label("Discount Type"),
          discountValue: Joi.number().min(0).default(0).label("Discount Value"),
          discountDescription: Joi.string().allow("", null).label("Discount Description"),
          discountDurationMonths: Joi.number().integer().min(0).default(0).label("Discount Duration (Months)"),
        })
      )
      .optional()
      .label("Prices"),

    highlights: Joi.array().items(Joi.string()).optional().label("Highlights"),
  }),
};

export default {
  createPlan,
  updatePlan,
};
