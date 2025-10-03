import Joi from "joi";

const optionsSchema = Joi.object({
  A: Joi.string().required(),
  B: Joi.string().required(),
  C: Joi.string().required(),
  D: Joi.string().required(),
});

const createQuestion = {
  body: Joi.object().keys({
    quiz: Joi.string().hex().length(24).required().label("Quiz"),
    questionText: Joi.string().required().label("Question Text"),
    options: optionsSchema.required().label("Options"),
    correctAnswer: Joi.string().valid("A", "B", "C", "D").required(),
  }),
};

const updateQuestion = {
  body: Joi.object().keys({
    quiz: Joi.string().hex().length(24).label("Quiz"),
    questionText: Joi.string().label("Question Text"),
    options: optionsSchema.label("Options"),
    correctAnswer: Joi.string().valid("A", "B", "C", "D").label("Correct Answer"),
  }),
};

export default {
  createQuestion,
  updateQuestion,
};
