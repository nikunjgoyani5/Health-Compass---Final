import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const createTelemedicineDetail = {
  body: Joi.object().keys({
    appointmentDate: Joi.date().required().label("Appointment Date"),
    appointmentStartTime: Joi.string().required().label("Appointment Start Time"),
    appointmentEndTime: Joi.string().required().label("Appointment End Time"),
    doctorId: Joi.string().required().label("Doctor ID"),
    notes: Joi.string().allow(null, "").label("Notes"),
    videoCall: Joi.object().keys({
      link: Joi.string().allow(null, "").label("Video Call Link"),
      startedAt: Joi.date().allow(null).label("Video Call Started At"),
      endedAt: Joi.date().allow(null).label("Video Call Ended At"),
      durationMinutes: Joi.number().allow(null).label("Video Call Duration (Minutes)"),
      wasSuccessful: Joi.boolean().label("Video Call Successful"),
    }),
    appointmentType: Joi.valid(
      ...Object.values(enumConfig.appointmentTypeEnums)
    ).required().label("Appointment Type"),
    reasonForAppointment: Joi.valid(
      ...Object.values(enumConfig.reasonForAppointmentEnums)
    ).required().label("Reason For Appointment"),
    status: Joi.valid(
      ...Object.values(enumConfig.appointmentStatusEnums)
    ).default(enumConfig.appointmentStatusEnums.SCHEDULED).label("Status"),
  }),
};

const updateTelemedicineDetail = {
  body: Joi.object().keys({
    appointmentDate: Joi.date().label("Appointment Date"),
    appointmentStartTime: Joi.string().label("Appointment Start Time"),
    appointmentEndTime: Joi.string().label("Appointment End Time"),
    doctorId: Joi.string().label("Doctor ID"),
    notes: Joi.string().allow(null, "").label("Notes"),
    videoCall: Joi.object().keys({
      link: Joi.string().allow(null, "").label("Video Call Link"),
      startedAt: Joi.date().allow(null).label("Video Call Started At"),
      endedAt: Joi.date().allow(null).label("Video Call Ended At"),
      durationMinutes: Joi.number().allow(null).label("Video Call Duration (Minutes)"),
      wasSuccessful: Joi.boolean().label("Video Call Successful"),
    }),
    appointmentType: Joi.valid(
      ...Object.values(enumConfig.appointmentTypeEnums)
    ).label("Appointment Type"),
    reasonForAppointment: Joi.valid(
      ...Object.values(enumConfig.reasonForAppointmentEnums)
    ).label("Reason For Appointment"),
    status: Joi.valid(...Object.values(enumConfig.appointmentStatusEnums)).label("Status"),
  }),
};

const updateStatus = {
  body: Joi.object().keys({
    status: Joi.valid(
      ...Object.values(enumConfig.appointmentStatusEnums)
    ).required().label("Status"),
  }),
};

export default {
  createTelemedicineDetail,
  updateTelemedicineDetail,
  updateStatus,
};
