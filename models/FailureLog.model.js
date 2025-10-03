import mongoose from "mongoose";

const FailureLogSchema = new mongoose.Schema({
  taskId: { type: String, index: true },           // Orchestration task/run id
  attempt: { type: Number, default: 1 },
  failureType: { type: String, required: true },   // planning | execution | response | ingest | governance
  resolutionPath: { type: String, default: "" },   // what to try
  outcome: { type: String, default: "unresolved" },// unresolved | mitigated | resolved | escalated
  source: { type: String, default: "orchestration" }, // orchestration | pipeline | agent | api
  metadata: { type: Object, default: {} },         // raw AWS/meta
  createdAt: { type: Date, default: Date.now }
},{ timestamps:true });

FailureLogSchema.index({ taskId:1, attempt:1 });
export default mongoose.model("FailureLog", FailureLogSchema);
