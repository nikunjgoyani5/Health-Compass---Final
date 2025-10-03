import Joi from "joi";
import { StatusCodes } from "http-status-codes";
import { validateResponse } from "../helper/api-response.helper.js";

/**
 * Picks specific keys from an object
 */
const pick = (object, keys) => {
  return keys.reduce((obj, key) => {
    if (object && Object.prototype.hasOwnProperty.call(object, key)) {
      obj[key] = object[key];
    }
    return obj;
  }, {});
};

/**
 * Get first required key from Joi schema
 */
const getFirstRequiredFieldName = (schemaSection) => {
  if (!schemaSection || typeof schemaSection.describe !== "function")
    return null;

  const description = schemaSection.describe();
  const keys = description.keys || {};

  for (const [key, meta] of Object.entries(keys)) {
    if (meta.flags && meta.flags.presence === "required") {
      return key;
    }
  }

  return null;
};

/**
 * Middleware to validate request data, including `multipart/form-data`
 */
const validate = (schema) => (req, res, next) => {
  const validSchema = pick(schema, ["params", "query", "body", "files"]);

  if (req.file) {
    req.files = { agreementUrl: req.file };
  }
  if (!req.files) req.files = {};

  const object = pick(req, Object.keys(validSchema));

  const hasRequiredFields =
    getFirstRequiredFieldName(schema.body) ||
    getFirstRequiredFieldName(schema.params) ||
    getFirstRequiredFieldName(schema.query) ||
    getFirstRequiredFieldName(schema.files);

  if (hasRequiredFields) {
    const isEmptyInput = ["params", "query", "body", "files"].every((key) => {
      return (
        !object[key] ||
        (typeof object[key] === "object" &&
          Object.keys(object[key]).length === 0)
      );
    });

    if (isEmptyInput) {
      const message = `"${hasRequiredFields}" is required.`;

      return validateResponse({
        res,
        error: { message },
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }

  const { value, error } = Joi.compile(validSchema)
    .prefs({ errors: { label: "key" }, abortEarly: false })
    .validate(object);

  if (error) {
    return validateResponse({
      res,
      error,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  Object.assign(req, value);
  return next();
};

export default validate;
