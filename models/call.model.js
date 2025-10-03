import mongoose from "mongoose";

const CallSchema = new mongoose.Schema({
  callSid: { type: String, required: true },
  webRTCClientId: { type: String, required: true },
  status: {
    type: String,
    enum: ["waiting", "connected", "ended"],
    default: "waiting",
  },
  createdAt: { type: Date, default: Date.now },
});

const Call = mongoose.model("Call", CallSchema);

export default Call;
