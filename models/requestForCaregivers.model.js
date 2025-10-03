import mongoose from "mongoose";
import enums from "../config/enum.config.js";

const requestSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    receiverEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        enums.requestStatusEnum.PENDING,
        enums.requestStatusEnum.ACCEPTED,
        enums.requestStatusEnum.REJECTED,
      ],
      default: enums.requestStatusEnum.PENDING,
    },
  },
  { timestamps: true }
);

const RequestModel = mongoose.model("Request", requestSchema);
export default RequestModel;