import Joi from "joi";

const addNote = {
  body: Joi.object().keys({
    userId: Joi.string().required().label("User ID"),
    title: Joi.string().required().label("Title"),
    note: Joi.string().required().label("Note"),
  }),
};

export default {
  addNote,
};
