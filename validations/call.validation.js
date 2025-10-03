import Joi from "joi";

const validateTwilioCall = {
  body: Joi.object({
    CallSid: Joi.string().required().label("Call SID"),
    From: Joi.string().required().label("From"),
    To: Joi.string().required().label("To"),
  }),
};

const validateWebRTCConnect = {
  body: Joi.object({
    callSid: Joi.string().required().label("Call SID"),
    webRTCClientId: Joi.string().required().label("WebRTC Client ID"),
  }),
};

export default {
  validateTwilioCall,
  validateWebRTCConnect,
};
