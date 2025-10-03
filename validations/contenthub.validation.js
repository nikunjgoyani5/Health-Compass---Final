import Joi from "joi";
import enumConfig from "../config/enum.config.js";

// Common fields for content types that need them
const commonFields = {
  title: Joi.string().required().label("Title"),
  description: Joi.string().required().label("Description"),
  image: Joi.string().allow().label("Image"),
};

// Individual schemas per content type
const healthTipsSchema = Joi.object({
  ...commonFields,
});

const latestArticlesSchema = Joi.object({
  ...commonFields,
  shortDescription: Joi.string().required().label("Short description"),
  blogBody: Joi.string().required().label("Body"),
  doctorId: Joi.string().required().label("Doctor ID"),
});

const communitySuccessStoriesSchema = Joi.object({
  ...commonFields,
  communityName: Joi.string().required().label("Community name"),
  communityStatus: Joi.string().required().label("Community status"),
});

const featuredVideosSchema = Joi.object({
  title: Joi.string(),
  description: Joi.string(),
  video: Joi.string(),
});

const healthQnASchema = Joi.object({
  question: Joi.string().required(),
  answer: Joi.string().required(),
});

// Final create validation with `.when()` on `type`
const createContentHubValidation = {
  body: Joi.object({
    type: Joi.string()
      .valid(...Object.values(enumConfig.contentHubTypeEnums))
      .required(),
  })
    .when(
      Joi.object({
        type: Joi.valid(enumConfig.contentHubTypeEnums.HEALTH_TIPS),
      }).unknown(),
      {
        then: healthTipsSchema,
      }
    )
    .when(
      Joi.object({
        type: Joi.valid(enumConfig.contentHubTypeEnums.LATEST_ARTICLES),
      }).unknown(),
      {
        then: latestArticlesSchema,
      }
    )
    .when(
      Joi.object({
        type: Joi.valid(
          enumConfig.contentHubTypeEnums.COMMUTINY_SUCCESS_STORIES
        ),
      }).unknown(),
      {
        then: communitySuccessStoriesSchema,
      }
    )
    .when(
      Joi.object({
        type: Joi.valid(enumConfig.contentHubTypeEnums.FEATURED_VIDEOS),
      }).unknown(),
      {
        then: featuredVideosSchema,
      }
    )
    .when(
      Joi.object({
        type: Joi.valid(enumConfig.contentHubTypeEnums.HEALTH_QNA),
      }).unknown(),
      {
        then: healthQnASchema,
      }
    )
    .unknown(false),
};

export default { createContentHubValidation };
