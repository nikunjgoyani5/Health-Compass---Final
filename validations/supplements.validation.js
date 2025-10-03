import Joi from "joi";
import mongoose from "mongoose";

// Helper to check for valid MongoDB ObjectId
const objectId = () =>
  Joi.string().custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.message("Invalid ObjectId provided.");
    }
    return value;
  });

const addNewSupplementValidation = {
  body: Joi.object().keys({
    productName: Joi.string().required().label("Product Name"),
    brandName: Joi.string().optional().allow("").label("Brand Name"),
    servingsPerContainer: Joi.string().optional().allow("").label("Servings Per Container"),
    servingSize: Joi.string().optional().allow("").label("Serving Size"),
    ingredients: Joi.array().items(objectId()).optional().label("Ingredients"),
    usageGroup: Joi.array().items(Joi.string()).optional().label("Usage Group"),
    description: Joi.string().optional().allow("").label("Description"),
    warnings: Joi.array().items(Joi.string()).optional().label("Warnings"),
    claims: Joi.array().items(Joi.string()).optional().label("Claims"),
    isAvailable: Joi.boolean().optional().label("Availability"),
    tags: Joi.array().items(objectId()).optional().label("Tags"),
    image: Joi.string().optional().allow("", null).label("Image"),
  }),
};

const updateSupplementValidation = {
  body: Joi.object({
    productName: Joi.string().optional().label("Product Name"),
    brandName: Joi.string().optional().allow("").label("Brand Name"),
    servingsPerContainer: Joi.string().optional().allow("").label("Servings Per Container"),
    servingSize: Joi.string().optional().allow("").label("Serving Size"),
    ingredients: Joi.array().items(objectId()).optional().label("Ingredients"),
    usageGroup: Joi.array().items(Joi.string()).optional().label("Usage Group"),
    description: Joi.string().optional().allow("").label("Description"),
    warnings: Joi.array().items(Joi.string()).optional().label("Warnings"),
    claims: Joi.array().items(Joi.string()).optional().label("Claims"),
    isAvailable: Joi.boolean().optional().label("Availability"),
    tags: Joi.array().items(objectId()).optional().label("Tags"),
    image: Joi.string().optional().allow("", null).label("Image"),
  }),
};

export default { addNewSupplementValidation, updateSupplementValidation };
