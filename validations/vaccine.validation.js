import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const allowedModes = Object.values(enumConfig.perspectiveEnums);

const overlayNoteValidation = Joi.object({
  mode: Joi.string()
    .valid(...allowedModes)
    .required()
    .label("Mode")
    .messages({
      "any.only": `Mode must be one of: ${allowedModes.join(", ")}`,
      "any.required": "Mode is required",
    }),
  note: Joi.array().items(Joi.string()).required().label("Note"),
});

const createVaccine = {
  body: Joi.object().keys({
    vaccineName: Joi.string().required().label("Vaccine Name"),
    provider: Joi.string().required().label("Provider"),
    description: Joi.string().optional().label("Description"),
    spiritualOverlayNotes: Joi.array()
      .items(overlayNoteValidation)
      .optional()
      .default([])
      .label("Spiritual Overlay Notes"),
  }),
};

const updateVaccine = {
  body: Joi.object().keys({
    vaccineName: Joi.string().label("Vaccine Name"),
    description: Joi.string().label("Description"),
    provider: Joi.string().label("Provider"),
    spiritualOverlayNotes: Joi.array().items(overlayNoteValidation).optional().label("Spiritual Overlay Notes"),
  }),
};

export default {
  createVaccine,
  updateVaccine,
};
