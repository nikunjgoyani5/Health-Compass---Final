import mongoose from "mongoose";
const AgentSchemaRegistry = new mongoose.Schema({
  schemaType: { type: String, required: true },   // e.g., "recommendation_card", "plan_step"
  version: { type: String, required: true },      // e.g., "1.0.0"
  zodDef: { type: Object, required: true },       // stored zod json (for reference)
  active: { type: Boolean, default: true }
},{ timestamps:true });
AgentSchemaRegistry.index({ schemaType:1, version:1 }, { unique:true });
export default mongoose.model("AgentSchemaRegistry", AgentSchemaRegistry);
