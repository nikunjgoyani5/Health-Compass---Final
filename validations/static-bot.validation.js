import Joi from "joi";

const createHealthCheck = {
  body: Joi.object().keys({
    title: Joi.string().required().label("Title"),
    description: Joi.string().required().label("Description"),
    prompts: Joi.array().items(
      Joi.object().keys({
        question: Joi.string().label("Question"),
      })
    ),
  }),
};

const addPrompts = {
  body: Joi.object().keys({
    question: Joi.string().required().label("Question"),
  }),
};

const updateData = {
  body: Joi.object().keys({
    title: Joi.string().label("Title"),
    description: Joi.string().label("Description"),
    prompts: Joi.array().items(
      Joi.object().keys({
        question: Joi.string().label("Question"),
      })
    ),
  }),
};

const askQuestion = {
  body: Joi.object().keys({
    prompt: Joi.string().required().label("Prompt"),
  }),
};

export default {
  createHealthCheck,
  addPrompts,
  updateData,
  askQuestion,
};
