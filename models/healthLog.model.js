import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const healthEntrySchema = new mongoose.Schema(
  {
    totalSteps: { type: Number, default: 0 },
    totalCalories: { type: Number, default: 0.0 },
    avgHeartRate: { type: Number, default: 0.0 },
    sleep: { type: Number, default: 0.0 },
    water: { type: Number, default: 0.0 },
    weight: { type: Number, default: 0.0 },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// This data is fetched once per day and updated if there are multiple syncs in a day from different devices
const healthLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    logDate: { type: Date },
    deviceType: {
      type: String,
      enum: Object.values(enumConfig.deviceTypeEnum),
      default: enumConfig.deviceTypeEnum.OTHER,
    },
    latestLogData: healthEntrySchema,

    // Array of multiple syncs for the day
    logHistory: [healthEntrySchema],
  },
  { timestamps: true }
);

healthLogSchema.index({ userId: 1, date: 1 });

const HealthLogModel = mongoose.model("HealthLog", healthLogSchema);
export default HealthLogModel;
