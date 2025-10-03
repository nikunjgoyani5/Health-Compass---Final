import Joi from "joi";
import { 
  DISCLAIMER_TYPES_ARRAY, 
  DISCLAIMER_VALIDATION_RULES, 
  DISCLAIMER_ERROR_MESSAGES 
} from "../config/disclaimer.config.js";
import { commonValidations, customMessages } from "./helpers/validation.helper.js";

// Create disclaimer validation
export const createDisclaimer = {
  body: Joi.object({
    type: commonValidations.enum(DISCLAIMER_TYPES_ARRAY, "Disclaimer type"),
    
    title: commonValidations.requiredString(
      DISCLAIMER_VALIDATION_RULES.TITLE.MIN_LENGTH,
      DISCLAIMER_VALIDATION_RULES.TITLE.MAX_LENGTH,
      "Title"
    ),
    
    content: commonValidations.requiredString(
      DISCLAIMER_VALIDATION_RULES.CONTENT.MIN_LENGTH,
      DISCLAIMER_VALIDATION_RULES.CONTENT.MAX_LENGTH,
      "Content"
    )
  })
};

// Update disclaimer validation - सभी fields optional
export const updateDisclaimer = {
  params: Joi.object({
    id: commonValidations.mongoId
  }),
  
  body: Joi.object({
    type: commonValidations.optionalEnum(DISCLAIMER_TYPES_ARRAY, "Disclaimer type"),
    title: commonValidations.optionalString(
      DISCLAIMER_VALIDATION_RULES.TITLE.MIN_LENGTH,
      DISCLAIMER_VALIDATION_RULES.TITLE.MAX_LENGTH,
      "Title"
    ),
    content: commonValidations.optionalString(
      DISCLAIMER_VALIDATION_RULES.CONTENT.MIN_LENGTH,
      DISCLAIMER_VALIDATION_RULES.CONTENT.MAX_LENGTH,
      "Content"
    ),
    isActive: commonValidations.boolean
  }).min(1).messages({
    "object.min": "At least one field must be provided for update"
  })
};

// Get disclaimer by ID validation
export const getDisclaimerById = {
  params: Joi.object({
    id: commonValidations.mongoId
  })
};

// Delete disclaimer validation
export const deleteDisclaimer = {
  params: Joi.object({
    id: commonValidations.mongoId
  })
};

// Get all disclaimers validation - Only active disclaimers
export const getAllDisclaimers = {
  query: Joi.object({
    type: commonValidations.optionalEnum(DISCLAIMER_TYPES_ARRAY, "Disclaimer type"),
    ...commonValidations.pagination
  })
};

// Default export for all validation schemas - Only 5 APIs
export default {
  createDisclaimer,
  updateDisclaimer,
  getDisclaimerById,
  deleteDisclaimer,
  getAllDisclaimers
};