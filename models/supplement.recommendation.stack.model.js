import mongoose from "mongoose";

const UserStackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    items: [
      {
        supplementRecommendationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "UserRecommendation",
        },
        // Snapshot of recommendation details
        recommendationSnapshot: {
          supplementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplement",
          },
          supplement: {
            type: mongoose.Schema.Types.Mixed,
          },
          recommendation_tag: { type: String },
          confidence_score: { type: Number, min: 0, max: 100 },
          confidence_label: { type: String },
          matched_goals: { type: [String], default: [] },
          ai_insight: { type: String, default: null },
          action: { type: String },
          reason: { type: String },
          shuffleKey: { type: Number },
          createdAt: { type: Date },
          updatedAt: { type: Date },
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const SupplementRecommendationStack = mongoose.model(
  "SupplementRecommendationStack",
  UserStackSchema
);

export default SupplementRecommendationStack;
