import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    notifications: [
      {
        title: { type: String },
        message: { type: String },
        type: {
          type: String,
          enum: Object.values(enumConfig.notificationPreferencesEnum),
        },
        actionUrl: { type: String },
        image: { type: String },
        isRead: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
