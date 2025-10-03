import mongoose from "mongoose";
const OpsSummarySchema = new mongoose.Schema({
  orchestration: { status: { type:String, default:"UNKNOWN" } },
  pipeline: {
    lastRun: { type: Date, default: null },
    success: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    errors: { type: Number, default: 0 }
  },
  governance: {
    driftSentinel: { type:Boolean, default:false },
    reflectionAnchors: { type:Boolean, default:false },
    overridePending: { type:Boolean, default:false }
  },
  failover: {
    aws: { type:String, default:"UNKNOWN" },
    digitalOcean: { type:String, default:"UNKNOWN" },
    readyToFailover: { type:Boolean, default:false }
  }
},{ timestamps:true });

export default mongoose.model("OpsSummary", OpsSummarySchema);
