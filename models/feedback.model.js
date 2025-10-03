import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const mongooseSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    description: String,
    tag: { type: String, enum: Object.values(enumConfig.feedbackTagEnums) },
  },
  { timestamps: true }
);

const FeedbackModel = mongoose.model("feedback", mongooseSchema);
export default FeedbackModel;
