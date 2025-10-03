import Joi from "joi";

const createQuiz = {
  body: Joi.object().keys({
    title: Joi.string().required().label("Title"),
    description: Joi.string().required().label("Description"),
    totalQuestions: Joi.number().integer().min(1).required().label("Total Questions"),
    timeLimit: Joi.number().integer().min(1).required().label("Time Limit"), // in seconds
  }),
};

const updateQuiz = {
  body: Joi.object().keys({
    title: Joi.string().label("Title"),
    description: Joi.string().label("Description"),
    totalQuestions: Joi.number().integer().min(1).label("Total Questions"),
    timeLimit: Joi.number().integer().min(1).label("Time Limit"),
  }),
};

export default {
  createQuiz,
  updateQuiz,
};
