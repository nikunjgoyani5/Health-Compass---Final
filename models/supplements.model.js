import mongoose from "mongoose";

const SupplementSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    productName: { type: String },
    brandName: String,
    servingsPerContainer: String,
    servingSize: String,
    ingredients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ingredient",
      },
    ],
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SupplementTag",
      },
    ],
    usageGroup: [String],
    description: String,
    warnings: [String],
    claims: [String],
    isAvailable: { type: Boolean, default: true },
    createdByAdmin: {
      type: Boolean,
      default: false,
    },
    image: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const SupplementModel = mongoose.model("Supplement", SupplementSchema);
export default SupplementModel;
