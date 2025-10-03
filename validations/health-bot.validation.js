import Joi from "joi";

const chatWithHealthBot = {
  body: Joi.object().keys({
    message: Joi.string().required().label("Message"),
    chatId: Joi.string().optional().label("Chat ID"),
  }),
};

const clearUserCache = {
  // No body validation needed for cache clearing
};

export default { chatWithHealthBot, clearUserCache };