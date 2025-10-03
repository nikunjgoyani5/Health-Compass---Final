import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const healthEntryValidation = Joi.object({
  totalSteps: Joi.number().min(0).required().label("Total Steps"),
  totalCalories: Joi.number().min(0).required().label("Total Calories"),
  avgHeartRate: Joi.number().min(0).required().label("Average Heart Rate"),
  sleep: Joi.number().min(0).required().label("Sleep Hours"),
  water: Joi.number().min(0).required().label("Water Intake"),
  weight: Joi.number().min(0).required().label("Weight"),
  recordedAt: Joi.date().optional().label("Recorded At"),
});

const addHealthLog = {
  body: Joi.object().keys({
    logDate: Joi.string()
      .optional()
      .custom((value, helpers) => {
        const regex = /^\d{4}\/\d{2}\/\d{2}$/;
        if (!regex.test(value)) {
          return helpers.error("any.invalid");
        }

        const [year, month, day] = value.split("/").map(Number);

        if (month < 1 || month > 12 || day < 1 || day > 31) {
          return helpers.error("any.invalid");
        }

        const dateObj = new Date(`${year}-${month}-${day}`);
        if (
          dateObj.getFullYear() !== year ||
          dateObj.getMonth() + 1 !== month ||
          dateObj.getDate() !== day
        ) {
          return helpers.error("any.invalid");
        }

        return value;
      })
      .label("Log Date (yyyy/mm/dd)")
      .messages({
        "any.invalid": "Log Date must be a valid date in yyyy/mm/dd format.",
      }),
    deviceType: Joi.string()
      .valid(...Object.values(enumConfig.deviceTypeEnum))
      .required()
      .label("Device Type"),
    latestLogData: healthEntryValidation.required().label("Latest Log Data"),
  }),
};

export default {
  addHealthLog,
};
