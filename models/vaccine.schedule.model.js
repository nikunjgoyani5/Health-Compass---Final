import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";
// import { checkAndUpdateMissedVaccineSchedules } from "../services/vaccine.service.js";

const mongooseSchema = new mongoose.Schema(
  {
    vaccineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vaccine",
    },
    scheduleBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    date: Date,
    doseTime: String,
    reactionDetail: String,
    scheduleStatus: {
      type: String,
      enums: Object.values(enumConfig.scheduleStatusEnums),
      default: enumConfig.scheduleStatusEnums.PENDING,
    },
    isReminderSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// mongooseSchema.post("save", function () {
//   checkAndUpdateMissedVaccineSchedules();
// });

// mongooseSchema.post("updateOne", function () {
//   checkAndUpdateMissedVaccineSchedules();
// });

// mongooseSchema.post("find", function () {
//   if (this.getOptions().skipHook) return;
//   checkAndUpdateMissedVaccineSchedules();
// });

// export const VaccineSchedule = mongoose.model(
//   "VaccineSchedule",
//   mongooseSchema
// );

const VaccineSchedule = mongoose.model("VaccineSchedule", mongooseSchema);
export default VaccineSchedule;
