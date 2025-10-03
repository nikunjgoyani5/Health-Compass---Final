import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const RecommendationLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    supplementId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplement" },
    action: {
      type: String,
      enum: Object.values(enumConfig.supplementRecommendationLogEnums),
      index: true,
    },
    meta: { type: Object },
  },
  { timestamps: true }
);

const RecommendationLogModel = mongoose.model(
  "SupplementRecommendationLog",
  RecommendationLogSchema
);

export default RecommendationLogModel;
