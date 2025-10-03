import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const onboardingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    age: { type: Number },
    gender: { type: String, enum: Object.values(enumConfig.genderEnums) },
    weight: { type: Number },
    weightUnit: {
      type: String,
      default: "kg",
    },
    height: { type: Number },
    heightUnit: {
      type: String,
      default: "cm",
    },
    goal: [
      {
        type: String,
        enum: Object.values(enumConfig.goalEnums),
      },
    ],
    activityLevel: {
      type: String,
      enum: Object.values(enumConfig.activityLevelEnums),
    },
    perspective: {
      type: String,
      enum: Object.values(enumConfig.perspectiveEnums),
      default: enumConfig.perspectiveEnums.BALANCED,
    },
    city: {
      type: String,
      default: "Surat",
    },
  },
  { timestamps: true }
);

const Onboarding = mongoose.model("Onboarding", onboardingSchema);
export default Onboarding;
