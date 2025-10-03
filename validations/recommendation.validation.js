import Joi from "joi";

// Tag Based Recommendations
export const tagBasedValidation = Joi.object({
  tags: Joi.array()
    .items(Joi.string().min(2).max(50).label("Tag"))
    .min(1)
    .max(10)
    .required()
    .messages({
      "array.min": "At least one tag is required",
      "array.max": "Maximum 10 tags allowed",
      "string.min": "Tag must be at least 2 characters long",
      "string.max": "Tag must not exceed 50 characters",
    }),
});

// Usage Group Based Recommendations
export const usageGroupValidation = Joi.object({
  usageGroups: Joi.array()
    .items(Joi.string().min(2).max(50).label("Usage Group"))
    .min(1)
    .max(10)
    .required()
    .messages({
      "array.min": "At least one usage group is required",
      "array.max": "Maximum 10 usage groups allowed",
      "string.min": "Usage group must be at least 2 characters long",
      "string.max": "Usage group must not exceed 50 characters",
    }),
});

// Description Search Based Recommendations
export const descriptionSearchValidation = Joi.object({
  searchQuery: Joi.string()
    .required()
    .min(3)
    .max(200)
    .label("Search Query")
    .messages({
      "string.empty": "Search query is required",
      "string.min": "Search query must be at least 3 characters long",
      "string.max": "Search query must not exceed 200 characters",
    }),
});

// Claims Based Recommendations
export const claimsBasedValidation = Joi.object({
  claims: Joi.array()
    .items(Joi.string().min(2).max(100).label("Claim"))
    .min(1)
    .max(10)
    .required()
    .messages({
      "array.min": "At least one claim is required",
      "array.max": "Maximum 10 claims allowed",
      "string.min": "Claim must be at least 2 characters long",
      "string.max": "Claim must not exceed 100 characters",
    }),
});

// Related Ingredients Based Recommendations
export const relatedIngredientsValidation = Joi.object({
  supplementId: Joi.string()
    .required()
    .label("Supplement ID")
    .custom((value, helpers) => {
      // Basic MongoDB ObjectId validation
      if (!/^[0-9a-fA-F]{24}$/.test(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .messages({
      "any.invalid": "Invalid supplement ID format",
      "string.empty": "Supplement ID is required",
    }),
  limit: Joi.number().integer().min(1).max(20).default(10).label("Limit"),
});

// Combined validation for all variants
export const recommendationValidation = Joi.object({
  // Tag Based
  tags: Joi.array().items(Joi.string()).label("Tags"),
  
  // Usage Group Based
  usageGroups: Joi.array().items(Joi.string()).label("Usage Groups"),
  
  // Description Search Based
  searchQuery: Joi.string().min(3).max(200).label("Search Query"),
  
  // Claims Based
  claims: Joi.array().items(Joi.string()).label("Claims"),
  
  // Related Ingredients
  supplementId: Joi.string().label("Supplement ID"),
  limit: Joi.number().integer().min(1).max(20).label("Limit"),
}).custom((value, helpers) => {
  // Ensure at least one input method is provided
  const hasTags = value.tags && value.tags.length > 0;
  const hasUsageGroups = value.usageGroups && value.usageGroups.length > 0;
  const hasSearchQuery = value.searchQuery && value.searchQuery.trim().length > 0;
  const hasClaims = value.claims && value.claims.length > 0;
  const hasSupplementId = value.supplementId && value.supplementId.trim().length > 0;
  
  if (!hasTags && !hasUsageGroups && !hasSearchQuery && !hasClaims && !hasSupplementId) {
    return helpers.error("any.invalid", { 
      message: "At least one of tags, usageGroups, searchQuery, claims, or supplementId must be provided" 
    });
  }
  
  return value;
});

export default {
  tagBasedValidation,
  usageGroupValidation,
  descriptionSearchValidation,
  claimsBasedValidation,
  relatedIngredientsValidation,
  recommendationValidation,
}; 