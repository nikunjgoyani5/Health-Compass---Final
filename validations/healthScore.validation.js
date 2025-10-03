import Joi from "joi";

const healthScoreValidation = {
  body: Joi.object().keys({
    score: Joi.number().required().default(0).label("Score"),
  }),
};

export default { healthScoreValidation };