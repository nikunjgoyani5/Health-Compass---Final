import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const createMedicineSchedule = {
  body: Joi.object().keys({
    userId: Joi.string().label("User Id"),
    medicineName: Joi.string().required().label("Medicine Name"),
    quantity: Joi.number().min(1).required().label("Quantity"),
    startDate: Joi.date().required().label("Start Date"),
    endDate: Joi.date().required().label("End Date"),
    doseTimes: Joi.array()
      .items(
        Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM)$/i)
      )
      .min(1)
      .required()
      .label("Dose Times"),
    totalDosesPerDay: Joi.number().required().label("Total doses per day"),
  }),
};

const updateDoseStatus = {
  body: Joi.object().keys({
    date: Joi.date().required().label("Date"),
    time: Joi.string().required().label("Time"),
    status: Joi.string()
      .valid(...Object.values(enumConfig.scheduleStatusEnums))
      .required()
      .label("Status"),
  }),
};

const addMedicineQuantity = {
  body: Joi.object().keys({
    quantity: Joi.number().strict().required().label("Quantity"),
  }),
};

const updateStatus = {
  body: Joi.object().keys({
    status: Joi.string()
      .valid(...Object.values(enumConfig.medicineScheduleStatus))
      .required()
      .label("Status"),
  }),
};

const updateMedicineSchedule = {
  body: Joi.object().keys({
    userId: Joi.string().label("User Id"),
    medicineName: Joi.string().label("Medicine Name"),
    quantity: Joi.number().min(1).label("Quantity"),
    startDate: Joi.date().label("Start Date"),
    endDate: Joi.date().label("End Date"),
    doseTimes: Joi.array()
      .items(
        Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM)$/i)
      )
      .label("Dose Times"),
    totalDosesPerDay: Joi.number().label("Total Doses Per Day"),
  }),
};

export default {
  createMedicineSchedule,
  updateDoseStatus,
  addMedicineQuantity,
  updateStatus,
  updateMedicineSchedule,
};
