import { de } from "chrono-node";
import Joi from "joi";

const stringOrArray = Joi.alternatives().try(
  Joi.array().items(Joi.string()),
  Joi.string()
);

const updateDoctorDetails = {
  body: Joi.object().keys({
    fullName: Joi.string().label("Fullname"),
    email: Joi.string().email().label("Email"),
    experience: Joi.number().label("Experience"),
    phoneNumber: Joi.number().label("Phone number"),
    profileImage: Joi.string().label("Profile image"),
    description: Joi.string().label("Description"),
    specialization: stringOrArray.label("Specialization"),
    qualifications: stringOrArray.label("Qualifications"),
  }),
};

const addDoctor = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().required().label("Password"),
    fullName: Joi.string().optional().label("Full Name"),
    experience: Joi.number().optional().label("Experience"),
    phoneNumber: Joi.number().optional().label("Phone Number"),
    description: Joi.string().optional().label("Description"),
    profileImage: Joi.string().label("Profile Image"),
    specialization: stringOrArray.label("Specialization"),
  }),
};

export default {
  addDoctor,
  updateDoctorDetails,
};
