import Joi from "joi";

const saveHealthGoal = {
  body: Joi.object().keys({
    dailySteps: Joi.number().min(0).required().label("Daily Steps"),
    calories: Joi.number().min(0).required().label("Calories"),
    waterIntake: Joi.number().min(0).required().label("Water Intake"),
    sleepTarget: Joi.number().min(0).max(24).required().label("Sleep Target").messages({
      "number.base": "Sleep target must be a number",
      "number.min": "Sleep target cannot be negative",
      "number.max": "Sleep target cannot be greater than 24 hours",
      "any.required": "Sleep target is required",
    }),
    weightTarget: Joi.number().min(0).required().label("Weight Target"),
    enableGamification: Joi.boolean().required().label("Enable Gamification"),
  }),
};

export default {
  saveHealthGoal,
};
