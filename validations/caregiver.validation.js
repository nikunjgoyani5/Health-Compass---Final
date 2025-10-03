import Joi from "joi";

const stringOrArray = Joi.alternatives().try(
  Joi.array().items(Joi.string()),
  Joi.string()
);

const updateCaregiver = {
  body: Joi.object().keys({
    fullName: Joi.string().label("Fullname"),
    email: Joi.string().email().label("Email"),
    experience: Joi.number().label("Experience"),
    phoneNumber: Joi.number().label("Phone number"),
    profileImage: Joi.string().label("Profile image"),
    description: Joi.string().label("Description"),
    specialization: stringOrArray,
    qualifications: stringOrArray,
  }),
};

const addCaregiver = {
  body: Joi.object().keys({
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().required().label("Password"),
    fullName: Joi.string().optional().label("Fullname"),
  }),
};

export default {
  addCaregiver,
  updateCaregiver,
};
