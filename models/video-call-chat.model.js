import mongoose from "mongoose";
import enums from "../config/enum.config.js";

const { Schema, model } = mongoose;

const videoCallChatMessageSchema = new Schema(
  {
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: "Consultation",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    media: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: [
        enums.mediaTypeStatusEnum.IMAGE,
        enums.mediaTypeStatusEnum.VIDEO,
        enums.mediaTypeStatusEnum.FILE,
        enums.mediaTypeStatusEnum.AUDIO,
      ],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const VideoCallChatMessageModel = mongoose.model(
  "VideoCallChatMessage",
  videoCallChatMessageSchema
);
export default VideoCallChatMessageModel;
