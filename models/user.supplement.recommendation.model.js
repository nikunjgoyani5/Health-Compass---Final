import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const UserRecommendationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    supplementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplement",
    },

    supplement: {
      type: mongoose.Schema.Types.Mixed,
    },

    recommendation_tag: {
      type: String,
      enums: Object.values(enumConfig.recommendationTagEnums),
    },
    confidence_score: { type: Number, min: 0, max: 100 },
    confidence_label: {
      type: String,
      enum: Object.values(enumConfig.confidenceLabelEnums),
    },
    matched_goals: { type: [String], default: [] },
    ai_insight: { type: String, default: null },
    action: {
      type: String,
      enum: Object.values(enumConfig.supplementRecommendationLogEnums),
      index: true,
    },
    reason: {
      type: String,
    },
    // Stable random ordering for pagination in "shuffle" mode
    shuffleKey: { type: Number, index: true, default: () => Math.random() },
  },
  { timestamps: true }
);

UserRecommendationSchema.index({ userId: 1, createdAt: -1 });
UserRecommendationSchema.index({ userId: 1, supplementId: 1 });

export const UserRecommendation = mongoose.model(
  "UserRecommendation",
  UserRecommendationSchema
);
