import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const savePrivacySetting = {
  body: Joi.object().keys({
    enableDataSharing: Joi.boolean().required().label("Enable Data Sharing"),
    analyticsConsent: Joi.boolean().required().label("Analytics Consent"),
    perspective: Joi.string().valid(
      ...Object.values(enumConfig.perspectiveEnums)
    ).label("Perspective"),
  }),
};

export default {
  savePrivacySetting,
};
