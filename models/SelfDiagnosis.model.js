import mongoose from "mongoose";
const SelfDiagnosisSchema = new mongoose.Schema({
  taskId: { type: String, index: true },
  runId:  { type: String, index: true },
  checkpoint: { type: String, required: true },    // e.g., "plan_built", "pre_exec", "post_exec"
  notes: { type: String, required: true },
  score: { type: Number, default: 0 },             // confidence/quality score (0-100)
  tags: [{ type: String }]
},{ timestamps:true });

export default mongoose.model("SelfDiagnosis", SelfDiagnosisSchema);
