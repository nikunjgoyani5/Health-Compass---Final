import mongoose from "mongoose";

const SupplementViewLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    supplementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplement",
      required: true,
    },
    anonToken: { type: String },
    ip: { type: String },
    referrer: { type: String, default: "direct" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes for analytics
SupplementViewLogSchema.index({ supplementId: 1, createdAt: -1 });
SupplementViewLogSchema.index({ createdAt: -1 });
SupplementViewLogSchema.index({ anonToken: 1 });

const SupplementViewLog = mongoose.model(
  "SupplementViewLog",
  SupplementViewLogSchema
);

export default SupplementViewLog;
