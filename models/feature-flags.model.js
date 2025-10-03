import mongoose from "mongoose";

const featureFlagSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    key: { type: String, required: true },
    value: { type: Boolean, default: false },
    description: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

const FeatureFlagModel = mongoose.model("FeatureFlag", featureFlagSchema);
export default FeatureFlagModel;
