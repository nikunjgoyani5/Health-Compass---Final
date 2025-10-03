import mongoose from "mongoose";
const AwsLogSchema = new mongoose.Schema({
  source: { type: String, required: true }, // ECS | CloudWatch | CloudTrail | ECR
  data: { type: Object, default: {} }
},{ timestamps:true });

export default mongoose.model("AwsLog", AwsLogSchema);
