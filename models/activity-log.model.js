import mongoose from "mongoose";
import enums from "../config/enum.config.js";

const ActivityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: "User",
      index: true,
    },
    userRole: {
      type: [String],
      enum: Object.values(enums.userRoleEnum),
      required: false,
      default: [enums.userRoleEnum.USER],
    },
    activityType: {
      type: String,
      index: true,
    },
    activityCategory: {
      type: String,
      enum: Object.values(enums.activityCategoryEnum),
      required: false,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(enums.activityStatusEnum),
      default: enums.activityStatusEnum.INFO,
      required: true,
    },
    error: {
      message: { type: String },
      stack: { type: String },
      code: { type: String },
      details: { type: Object },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ActivityLogSchema.index({
  userId: 1,
  activityType: 1,
  activityCategory: 1,
  status: 1,
  createdAt: -1,
});

ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ userId: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", ActivityLogSchema);
export default ActivityLog;
