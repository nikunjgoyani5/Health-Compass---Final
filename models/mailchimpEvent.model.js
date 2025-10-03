import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const MailchimpEventSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    tags: [{ type: String }],
    source: { type: String },
    status: {
      type: String,
      enum: Object.values(enumConfig.mailchimpEventStatusEnum),
    },
    eventType: { type: String }, // For webhook events: subscribe, unsubscribe, etc.
    payload: { type: Object }, // Raw webhook payload
    timestamp: { type: Date, default: Date.now },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

const MailchimpEvent = mongoose.model("MailchimpEvent", MailchimpEventSchema);
export default MailchimpEvent;
