import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";
// import { updateMissedAppointmentByDoctor } from "../services/telemedicine.service.js";

const mongooseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    appointmentType: {
      type: String,
      enum: Object.values(enumConfig.appointmentTypeEnums),
    },
    appointmentDate: Date,
    appointmentStartTime: String, // e.g., "10:00 AM"
    appointmentEndTime: String, // e.g., "10:00 AM"
    status: {
      type: String,
      enum: Object.values(enumConfig.appointmentStatusEnums),
      default: enumConfig.appointmentStatusEnums.SCHEDULED,
    },
    videoCall: {
      link: String,
      startedAt: Date,
      endedAt: Date,
      durationMinutes: Number,
      wasSuccessful: {
        type: Boolean,
        default: false,
      },
    },
    notes: String,
    otaMeta: {
      updatedAt: Date,
      updatedBy: String,
    },
    reasonForAppointment: {
      type: String,
      enum: Object.values(enumConfig.reasonForAppointmentEnums),
      default: enumConfig.reasonForAppointmentEnums.OTHER,
    },
  },
  { timestamps: true }
);

// mongooseSchema.post("save", function () {
//   updateMissedAppointmentByDoctor();
// });

// mongooseSchema.post("updateOne", function () {
//   updateMissedAppointmentByDoctor();
// });

// mongooseSchema.post("find", function () {
//   if (this.getOptions().skipHook) return;
//   updateMissedAppointmentByDoctor();
// });

const Telemedicine = mongoose.model("Telemedicine", mongooseSchema);
export default Telemedicine;
