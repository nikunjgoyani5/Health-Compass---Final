import Joi from "joi";

const options = {
  frequency4: ["Never", "Occasionally", "Frequently", "Nearly every day"],
  frequencyStress: ["Never", "Occasionally", "Frequently", "Constantly"],
  enjoy: ["Always", "Sometimes", "Rarely", "Never"],
  sleepQuality: ["Excellent", "Good", "Poor", "Very Poor"],
  connected: [
    "Very connected",
    "Somewhat connected",
    "Not very connected",
    "Completely isolated",
  ],
  coping: ["Very well", "Somewhat well", "Poorly", "Not at all"],
  yesNo: ["Yes", "Sometimes", "Rarely", "No"],
  yesMaybeNo: ["Yes", "Maybe", "No"],
  sleepFreq: ["Never", "Occasionally", "Frequently", "Every night"],
};

const sectionAnswerSchemas = {
  "General Wellbeing": Joi.object({
    q1: Joi.string().valid(...options.frequency4).messages({
      "any.only": "Please select from: Never, Occasionally, Frequently, Nearly every day"
    }),
    q2: Joi.string().valid(...options.frequency4).messages({
      "any.only": "Please select from: Never, Occasionally, Frequently, Nearly every day"
    }),
    q3: Joi.string().valid(...options.enjoy).messages({
      "any.only": "Please select from: Always, Sometimes, Rarely, Never"
    }),
  })
    .min(1)
    .unknown(false)
    .messages({
      "object.min": "Please answer at least one question in General Wellbeing section"
    }),

  "Stress & Anxiety": Joi.object({
    q1: Joi.string().valid(...options.frequencyStress).messages({
      "any.only": "Please select from: Never, Occasionally, Frequently, Constantly"
    }),
    q2: Joi.string().valid(...options.frequencyStress).messages({
      "any.only": "Please select from: Never, Occasionally, Frequently, Constantly"
    }),
  })
    .min(1)
    .unknown(false)
    .messages({
      "object.min": "Please answer at least one question in Stress & Anxiety section"
    }),

  "Sleep Patterns": Joi.object({
    q1: Joi.string().valid(...options.sleepQuality).messages({
      "any.only": "Please select from: Excellent, Good, Poor, Very Poor"
    }),
    q2: Joi.string().valid(...options.sleepFreq).messages({
      "any.only": "Please select from: Never, Occasionally, Frequently, Every night"
    }),
  })
    .min(1)
    .unknown(false)
    .messages({
      "object.min": "Please answer at least one question in Sleep Patterns section"
    }),

  "Social & Emotional Health": Joi.object({
    q1: Joi.string().valid(...options.connected).messages({
      "any.only": "Please select from: Very connected, Somewhat connected, Not very connected, Completely isolated"
    }),
    q2: Joi.string().valid(...options.frequencyStress).messages({
      "any.only": "Please select from: Never, Occasionally, Frequently, Constantly"
    }),
  })
    .min(1)
    .unknown(false)
    .messages({
      "object.min": "Please answer at least one question in Social & Emotional Health section"
    }),

  "Coping & Resilience": Joi.object({
    q1: Joi.string().valid(...options.coping).messages({
      "any.only": "Please select from: Very well, Somewhat well, Poorly, Not at all"
    }),
    q2: Joi.string().valid(...options.yesNo).messages({
      "any.only": "Please select from: Yes, Sometimes, Rarely, No"
    }),
  })
    .min(1)
    .unknown(false)
    .messages({
      "object.min": "Please answer at least one question in Coping & Resilience section"
    }),

  "Final Thoughts": Joi.object({
    q1: Joi.string().valid(...options.yesMaybeNo).messages({
      "any.only": "Please select from: Yes, Maybe, No"
    }),
    q2: Joi.string().valid(...options.yesNo).messages({
      "any.only": "Please select from: Yes, Sometimes, Rarely, No"
    }),
  })
    .min(1)
    .unknown(false)
    .messages({
      "object.min": "Please answer at least one question in Final Thoughts section"
    }),
};

const allowedSections = Object.keys(sectionAnswerSchemas);

const sectionItemSchema = Joi.object({
  sectionName: Joi.string()
    .valid(...allowedSections)
    .required()
    .label("Section Name")
    .messages({
      "any.only": "Please select a valid section: General Wellbeing, Stress & Anxiety, Sleep Patterns, Social & Emotional Health, Coping & Resilience, Final Thoughts",
      "any.required": "Section name is required"
    }),
  answers: Joi.when("sectionName", {
    switch: allowedSections.map((name) => ({
      is: name,
      then: sectionAnswerSchemas[name],
    })),
    otherwise: Joi.forbidden(),
  }).required().label("Answers")
    .messages({
      "any.required": "Please provide answers for this section"
    }),
});

export const validateFillUpMentalHealth = {
  body: Joi.object({
    sections: Joi.array()
      .items(sectionItemSchema)
      .min(1)
      .max(allowedSections.length)
      .unique("sectionName")
      .required()
      .label("Sections")
      .messages({
        "array.min": "Please complete at least one section of the mental health questionnaire",
        "array.max": "Maximum 6 sections allowed in the mental health questionnaire",
        "array.unique": "Each section can only be completed once",
        "any.required": "Please provide the mental health questionnaire sections"
      }),
  })
    .messages({
      "object.base": "Please provide a valid questionnaire format"
    }),
};
