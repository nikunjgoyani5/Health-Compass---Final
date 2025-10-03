import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const onboardingSchema = {
  body: Joi.object().keys({
    age: Joi.number().label("Age"),
    gender: Joi.string()
      .valid(...Object.values(enumConfig.genderEnums))
      .label("Gender"),
    weight: Joi.number().strict().label("Weight"),
    height: Joi.number().strict().label("Height"),
    heightUnit: Joi.string().label("Height Unit"),
    weightUnit: Joi.string().label("Weight Unit"),
    goal: Joi.array()
      .items(Joi.string().valid(...Object.values(enumConfig.goalEnums)))
      .label("Goals"),
    activityLevel: Joi.string()
      .valid(...Object.values(enumConfig.activityLevelEnums))
      .label("Activity Level"),
    perspective: Joi.string()
      .valid(...Object.values(enumConfig.perspectiveEnums))
      .default(enumConfig.perspectiveEnums.BALANCED)
      .label("Perspective"),
    city: Joi.string().label("City"),
  }),
};

export default {
  onboardingSchema,
};
