import mongoose from "mongoose";

const { Schema } = mongoose;

const SupplementDetailsSchema = new mongoose.Schema(
  {
    sourceId: { type: String, unique: true },
    data: { type: Object },
  },
  { timestamps: true }
);

const SupplementDetails = mongoose.model(
  "SupplementDetails",
  SupplementDetailsSchema
);

export default SupplementDetails;
