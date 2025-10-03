import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const createFeedback = {
  body: Joi.object().keys({
    description: Joi.string().required().label("Description"),
    tag: Joi.string()
      .valid(...Object.values(enumConfig.feedbackTagEnums))
      .required()
      .label("Tag"),
  }),
};

export default { createFeedback };
