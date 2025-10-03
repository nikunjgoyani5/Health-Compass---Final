import Joi from "joi";

const submitAnswer = {
  body: Joi.object().keys({
    questionId: Joi.string().required().label("Question ID"),
    selectedOption: Joi.string().allow(null).required().label("Selected Option"),
  }),
};

export default {
  submitAnswer,
};
