import mongoose from "mongoose";

const AiQueryLogSchema = new mongoose.Schema(
  {
    anonToken: { type: String, default: null },
    query: { type: String, default: null },
    aiResponse: { type: String, default: null },
    model: { type: String, default: null },
    tokensUsed: { type: Number, default: 0 },
    success: { type: Boolean, default: false },
    errorMessage: { type: String, default: null },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes for admin filtering
AiQueryLogSchema.index({ createdAt: -1 });
AiQueryLogSchema.index({ anonToken: 1 });

const AiQueryLog = mongoose.model("AiQueryLog", AiQueryLogSchema);
export default AiQueryLog;
