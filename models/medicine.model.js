import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const overlayNoteSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: Object.values(enumConfig.perspectiveEnums),
  },
  note: { type: [String], default: [] },
});

const MedicineSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    medicineName: { type: String },
    dosage: { type: String },
    description: { type: String },
    takenForSymptoms: { type: String },
    associatedRisks: { type: String },
    price: { type: Number },
    quantity: { type: Number },
    singlePack: { type: String },
    mfgDate: { type: Date },
    expDate: { type: Date },
    createdByAdmin: {
      type: Boolean,
      default: false,
    },

    // ---------------- phase -2 keys  ----------------
    brandName: { type: String, default: null },
    manufacturer: { type: String, default: null },
    usage: { type: String, default: null },
    route: {
      type: String,
      default: null,
    },
    sideEffects: { type: [String], default: null },
    warnings: { type: [String], default: null },
    contraindications: { type: [String], default: null },
    storageInstructions: { type: String, default: null },
    pregnancySafe: { type: Boolean, default: null },
    pediatricUse: { type: Boolean, default: null },
    adverseReactions: { type: [String], default: null },
    rxRequired: { type: Boolean, default: null },

    // ------- Spiritual Overlay -------
    spiritualOverlayNotes: {
      type: [overlayNoteSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const Medicine = mongoose.model("Medicine", MedicineSchema);
export default Medicine;
