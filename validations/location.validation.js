import Joi from "joi";

const coordsSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required().label("Latitude").messages({
    "any.required": "Latitude is required.",
    "number.base": "Latitude must be a number.",
    "number.min": "Latitude cannot be less than -90.",
    "number.max": "Latitude cannot be greater than 90.",
  }),
  lon: Joi.number().min(-180).max(180).required().label("Longitude").messages({
    "any.required": "Longitude is required.",
    "number.base": "Longitude must be a number.",
    "number.min": "Longitude cannot be less than -180.",
    "number.max": "Longitude cannot be greater than 180.",
  }),
});

export default {
  coordsSchema,
};
