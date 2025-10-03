import mongoose from "mongoose";

const caregiverNoteSchema = new mongoose.Schema(
  {
    caregiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const CaregiverNote = mongoose.model("CaregiverNote", caregiverNoteSchema);

export default CaregiverNote;
