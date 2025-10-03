import mongoose from "mongoose";
import enums from "../config/enum.config.js";

const supportRequestSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [enums.statusSupportEnum.OPEN, enums.statusSupportEnum.CLOSE],
      default: enums.statusSupportEnum.OPEN,
    },
    attachment: {
      type: String,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const SupportRequest = mongoose.model("SupportRequest", supportRequestSchema);

export default SupportRequest;
