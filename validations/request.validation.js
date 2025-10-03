import Joi from "joi";
import enums from "../config/enum.config.js";

const sendRequest = {
  body: Joi.object().keys({
    receiver: Joi.string().required().label("Receiver"),
  }),
};

const updateRequestStatus = {
  params: Joi.object().keys({
    requestId: Joi.string().required().label("Request ID"),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid(
        enums.requestStatusEnum.PENDING,
        enums.requestStatusEnum.ACCEPTED,
        enums.requestStatusEnum.REJECTED
      )
      .required()
      .label("Status"),
  }),
};

export default {
  sendRequest,
  updateRequestStatus,
};
