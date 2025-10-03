import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const updateAvailability = {
  body: Joi.object().keys({
    availability: Joi.array().items(
      Joi.object().keys({
        day: Joi.string()
          .valid(...Object.values(enumConfig.doctorAvailabilityEnums))
          .required()
          .label("Day"),
        shift: Joi.array()
          .items(
            Joi.object().keys({
              startTime: Joi.string().required().label("Start time"),
              endTime: Joi.string().required().label("End time"),
            })
          )
          .required()
          .label("Shift"),
      })
    ),
  }),
};

export default {
  updateAvailability,
};
