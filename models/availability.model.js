import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const mongooseSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    availability: [
      {
        _id: false,
        day: {
          type: String,
          enum: Object.values(enumConfig.doctorAvailabilityEnums),
        },
        shift: [
          {
            _id: false,
            startTime: String,
            endTime: String,
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

const DoctorAvailability = mongoose.model("doctorAvailability", mongooseSchema);
export default DoctorAvailability;
