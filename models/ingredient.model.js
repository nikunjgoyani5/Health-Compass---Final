import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const NutrientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    amount: { type: String },
    dailyValuePercent: { type: String },
  },
  { _id: false }
);

const HealthEffectSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(enumConfig.healthEffectTypeEnum),
      default: enumConfig.healthEffectTypeEnum.NEUTRAL,
    },
  },
  { _id: false }
);

const IngredientSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    categories: {
      type: [String],
      default: [],
    },
    aliases: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
    },
    nutrients: {
      type: [NutrientSchema],
      default: [],
    },
    healthEffects: {
      type: [HealthEffectSchema],
      default: [],
    },
    usage: {
      type: String,
    },
    foundInFoods: {
      type: [String],
      default: [],
    },
    sideEffects: {
      type: [String],
      default: [],
    },
    precautions: {
      type: [String],
      default: [],
    },
    createdByAdmin: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const IngredientModel = mongoose.model("Ingredient", IngredientSchema);
export default IngredientModel;

// {
//   "createdBy": "684d061546ffa301b0e5a457",
//   "name": "Vitamin C",
//   "categories": ["Vitamin", "Antioxidant"],
//   "aliases": ["Ascorbic Acid"],
//   "description": "Vitamin C is an essential nutrient involved in the repair of tissue.",
//   "nutrients": [
//     {
//       "name": "Vitamin C",
//       "amount": "90mg",
//       "dailyValuePercent": 100
//     }
//   ],
//   "healthEffects": [
//     {
//       "description": "Boosts immune system",
//       "type": "positive"
//     },
//     {
//       "description": "May cause stomach upset at high doses",
//       "type": "negative"
//     }
//   ],
//   "usage": "Used in immune-boosting supplements.",
//   "foundInFoods": ["Oranges", "Broccoli"],
//   "sideEffects": ["Nausea", "Diarrhea (high dose)"],
//   "precautions": ["Consult doctor before use in pregnancy"],
//   "createdByAdmin": true,
//   "createdAt": "2025-07-16T13:00:00.000Z",
//   "updatedAt": "2025-07-16T13:00:00.000Z"
// }
