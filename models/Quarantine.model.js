import mongoose from "mongoose";
const QuarantineSchema = new mongoose.Schema({
  reason: { type: String, required: true },        // schema_mismatch | pii_detected | unsafe
  schemaType: { type: String, required: true },
  schemaVersion: { type: String, required: true },
  payload: { type: Object, required: true },       // raw agent output
  linkedTaskId: { type: String },
  createdAt: { type: Date, default: Date.now }
},{ timestamps:true });

export default mongoose.model("Quarantine", QuarantineSchema);
