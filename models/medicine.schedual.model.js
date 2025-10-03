import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const DoseEntrySchema = new mongoose.Schema(
  {
    time: String, // e.g. "08:00 AM"
    status: {
      type: String,
      enum: Object.values(enumConfig.scheduleStatusEnums),
      default: enumConfig.scheduleStatusEnums.PENDING,
    },
    note: String,
    isReminderSent: { type: Boolean, default: false },
    reminderSendOn: Date,
  },
  { _id: false }
);

const DailyDoseSchema = new mongoose.Schema(
  {
    date: Date, // e.g. "2025-04-14"
    doses: [DoseEntrySchema],
  },
  { _id: false }
);

const MedicineScheduleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    medicineName: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
    },
    dosage: String,
    quantity: Number,
    startDate: Date,
    endDate: Date,
    totalDosesPerDay: Number,
    status: {
      type: String,
      enum: Object.values(enumConfig.medicineScheduleStatus),
      default: enumConfig.medicineScheduleStatus.INACTIVE,
    },
    doseLogs: [DailyDoseSchema],
  },
  { timestamps: true }
);

const MedicineScheduleModel = mongoose.model(
  "MedicineSchedule",
  MedicineScheduleSchema
);

export default MedicineScheduleModel;
