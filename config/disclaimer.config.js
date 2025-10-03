// Disclaimer Types Enum Configuration
export const DISCLAIMER_TYPES = {
  MEDICINE: "medicine_disclaimer",
  VACCINE: "vaccine_disclaimer", 
  SUPPLEMENT: "supplement_disclaimer",
  SUPPLEMENT_RECOMMENDATION: "supplement_recommendation_disclaimer"
};

// Disclaimer Types Array for validation
export const DISCLAIMER_TYPES_ARRAY = Object.values(DISCLAIMER_TYPES);

// Disclaimer Types with Display Information
export const DISCLAIMER_TYPES_INFO = [
  {
    value: DISCLAIMER_TYPES.MEDICINE,
    label: "Medicine Disclaimer",
    description: "Disclaimer for medicine-related information"
  },
  {
    value: DISCLAIMER_TYPES.VACCINE,
    label: "Vaccine Disclaimer",
    description: "Disclaimer for vaccine-related information"
  },
  {
    value: DISCLAIMER_TYPES.SUPPLEMENT,
    label: "Supplement Disclaimer",
    description: "Disclaimer for supplement-related information"
  },
  {
    value: DISCLAIMER_TYPES.SUPPLEMENT_RECOMMENDATION,
    label: "Supplement Recommendation Disclaimer",
    description: "Disclaimer for supplement recommendation information"
  }
];

// Validation Rules
export const DISCLAIMER_VALIDATION_RULES = {
  TITLE: {
    MIN_LENGTH: 5,
    MAX_LENGTH: 200
  },
  CONTENT: {
    MIN_LENGTH: 50,
    MAX_LENGTH: 5000
  }
};

// Error Messages
export const DISCLAIMER_ERROR_MESSAGES = {
  TYPE_REQUIRED: "Disclaimer type is required",
  TYPE_INVALID: `Type must be one of: ${DISCLAIMER_TYPES_ARRAY.join(", ")}`,
  TITLE_REQUIRED: "Title is required",
  TITLE_MIN_LENGTH: `Title must be at least ${DISCLAIMER_VALIDATION_RULES.TITLE.MIN_LENGTH} characters long`,
  TITLE_MAX_LENGTH: `Title cannot exceed ${DISCLAIMER_VALIDATION_RULES.TITLE.MAX_LENGTH} characters`,
  CONTENT_REQUIRED: "Content is required",
  CONTENT_MIN_LENGTH: `Content must be at least ${DISCLAIMER_VALIDATION_RULES.CONTENT.MIN_LENGTH} characters long`,
  CONTENT_MAX_LENGTH: `Content cannot exceed ${DISCLAIMER_VALIDATION_RULES.CONTENT.MAX_LENGTH} characters`
};
