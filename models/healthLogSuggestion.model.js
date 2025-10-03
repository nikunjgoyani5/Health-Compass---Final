import mongoose from "mongoose";

const healthLogSuggestionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    date: {
      type: Date,
    },

    suggestions: [
      {
        key: { type: String }, // e.g., "hydration"
        title: { type: String }, // e.g., "Log Hydration"
        description: { type: String },
        tag: { type: String },
        isCompleted: { type: Boolean, default: false },
        note: { type: String, trim: true, default: null },
      },
    ],

    // 🔥 NEW: store past changes
    history: [
      {
        key: { type: String },
        title: { type: String },
        description: { type: String },
        tag: { type: String },
        isCompleted: { type: Boolean, default: false },
        note: { type: String, trim: true, default: null },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

healthLogSuggestionSchema.index({ userId: 1, date: 1 });

const HealthLogSuggestion = mongoose.model(
  "HealthLogSuggestion",
  healthLogSuggestionSchema
);
export default HealthLogSuggestion;
