import mongoose from "mongoose";

const DrugsDetailsSchema = new mongoose.Schema(
  {
    setid: {
      type: String,
      required: true,
      unique: true,
    },
    data: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

const DrugsDetails = mongoose.model("DrugsDetails", DrugsDetailsSchema);

export default DrugsDetails;
