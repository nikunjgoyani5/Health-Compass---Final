import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const scheduleVaccine = {
  body: Joi.object().keys({
    vaccineId: Joi.string().required().label("Vaccine ID"),
    date: Joi.date().required().label("Date"),
    doseTime: Joi.string().required().label("Dose Time"),
    reactionDetail: Joi.string().allow(null, "").label("Reaction Detail"),
    scheduleStatus: Joi.string()
      .valid(...Object.values(enumConfig.scheduleStatusEnums))
      .default(enumConfig.scheduleStatusEnums.PENDING)
      .label("Schedule Status"),
  }),
};

const updateSchedule = {
  body: Joi.object().keys({
    vaccineId: Joi.string().label("Vaccine ID"),
    date: Joi.date().label("Date"),
    doseTime: Joi.string().label("Dose Time"),
    reactionDetail: Joi.string().allow(null).label("Reaction Detail"),
    scheduleStatus: Joi.string().valid(
      ...Object.values(enumConfig.scheduleStatusEnums)
    ).label("Schedule Status"),
  }),
};

const updateScheduleStatus = {
  body: Joi.object().keys({
    scheduleStatus: Joi.string()
      .valid(...Object.values(enumConfig.scheduleStatusEnums))
      .required()
      .label("Schedule Status"),
  }),
};

export default {
  scheduleVaccine,
  updateSchedule,
  updateScheduleStatus,
};
