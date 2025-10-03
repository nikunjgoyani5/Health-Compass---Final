import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const overlayNoteSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: Object.values(enumConfig.perspectiveEnums),
  },
  note: { type: [String], default: [] },
});

const mongooseSchema = new mongoose.Schema(
  {
    vaccineName: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdByAdmin: {
      type: Boolean,
      default: false,
    },
    spiritualOverlayNotes: {
      type: [overlayNoteSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const VaccineModel = mongoose.model("Vaccine", mongooseSchema);
export default VaccineModel;
