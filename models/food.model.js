import mongoose from "mongoose";

const FoodSchema = new mongoose.Schema(
  {
    barcode: { type: String, unique: true, index: true },
    productName: { type: String, required: true },
    brandName: { type: String },
    calories: { type: Number },
    protein: { type: Number },
    carbs: { type: Number },
    fat: { type: Number },
    ingredients: [{ type: String }],

    source: { type: String, enum: ["API", "MANUAL"], default: "API" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const MealLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    food: { type: mongoose.Schema.Types.ObjectId, ref: "Food" },
    loggedAt: Date,
  },
  { timestamps: true }
);

export const FoodModel = mongoose.model("Food", FoodSchema);
export const MealLog = mongoose.model("Meal", MealLogSchema);
