import Joi from "joi";

// Common validation patterns
export const commonValidations = {
  // MongoDB ObjectId validation
  mongoId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid ID format",
      "any.required": "ID is required"
    }),

  // Pagination validation
  pagination: {
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        "number.base": "Page must be a number",
        "number.integer": "Page must be an integer",
        "number.min": "Page must be at least 1"
      }),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .messages({
        "number.base": "Limit must be a number",
        "number.integer": "Limit must be an integer",
        "number.min": "Limit must be at least 1",
        "number.max": "Limit cannot exceed 100"
      })
  },

  // Boolean validation
  boolean: Joi.boolean()
    .messages({
      "boolean.base": "Must be a boolean value"
    }),

  // String validation with length constraints
  stringWithLength: (minLength, maxLength, fieldName) => Joi.string()
    .trim()
    .min(minLength)
    .max(maxLength)
    .messages({
      "string.empty": `${fieldName} cannot be empty`,
      "string.min": `${fieldName} must be at least ${minLength} characters long`,
      "string.max": `${fieldName} cannot exceed ${maxLength} characters`
    }),

  // Required string validation
  requiredString: (minLength, maxLength, fieldName) => Joi.string()
    .trim()
    .min(minLength)
    .max(maxLength)
    .required()
    .messages({
      "string.empty": `${fieldName} cannot be empty`,
      "string.min": `${fieldName} must be at least ${minLength} characters long`,
      "string.max": `${fieldName} cannot exceed ${maxLength} characters`,
      "any.required": `${fieldName} is required`
    }),

  // Optional string validation
  optionalString: (minLength, maxLength, fieldName) => Joi.string()
    .trim()
    .min(minLength)
    .max(maxLength)
    .messages({
      "string.empty": `${fieldName} cannot be empty`,
      "string.min": `${fieldName} must be at least ${minLength} characters long`,
      "string.max": `${fieldName} cannot exceed ${maxLength} characters`
    }),

  // Enum validation
  enum: (values, fieldName) => Joi.string()
    .valid(...values)
    .required()
    .messages({
      "any.only": `${fieldName} must be one of: ${values.join(", ")}`,
      "any.required": `${fieldName} is required`
    }),

  // Optional enum validation
  optionalEnum: (values, fieldName) => Joi.string()
    .valid(...values)
    .messages({
      "any.only": `${fieldName} must be one of: ${values.join(", ")}`
    })
};

// Validation error formatter
export const formatValidationError = (error) => {
  const details = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    value: detail.context?.value
  }));

  return {
    error: 'Validation Error',
    details,
    message: 'Please check the following fields and try again'
  };
};

// Custom validation messages
export const customMessages = {
  required: (field) => `${field} is required`,
  invalid: (field, validValues) => `${field} must be one of: ${validValues.join(", ")}`,
  minLength: (field, min) => `${field} must be at least ${min} characters long`,
  maxLength: (field, max) => `${field} cannot exceed ${max} characters`,
  pattern: (field) => `Invalid ${field} format`,
  boolean: (field) => `${field} must be a boolean value`,
  number: (field) => `${field} must be a number`,
  integer: (field) => `${field} must be an integer`,
  min: (field, min) => `${field} must be at least ${min}`,
  max: (field, max) => `${field} cannot exceed ${max}`
};
