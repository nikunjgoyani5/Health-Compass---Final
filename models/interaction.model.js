import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const InteractionSchema = new mongoose.Schema(
  {
    itemAType: {
      type: String,
      enum: Object.values(enumConfig.interactionItemTypeEnums),
      required: true,
    },
    itemAId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "itemAType", // Dynamically reference Medicine or Supplement
    },
    itemBType: {
      type: String,
      enum: Object.values(enumConfig.interactionItemTypeEnums),
      required: true,
    },
    itemBId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "itemBType",
    },
    severity: {
      type: String,
      enum: Object.values(enumConfig.severityLevelEnums),
      required: true,
    },
    explanation: {
      type: String,
      required: true,
    },
    disclaimer: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: Object.values(enumConfig.interactionSourceEnums),
      default: enumConfig.interactionSourceEnums.AI,
    },
    // New fields for multi-item interactions
    isMultiItem: {
      type: Boolean,
      default: false,
    },
    itemCount: {
      type: Number,
      default: 2,
    },
    allItems: [{
      type: {
        type: String,
        enum: Object.values(enumConfig.interactionItemTypeEnums),
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
      },
      name: {
        type: String,
      }
    }],
  },
  { timestamps: true }
);

// Prevent duplicates like (A,B) and (B,A)
InteractionSchema.index(
  { itemAType: 1, itemAId: 1, itemBType: 1, itemBId: 1 },
  { unique: true }
);

// Index for multi-item interactions
InteractionSchema.index(
  { isMultiItem: 1, itemCount: 1, itemAType: 1, itemAId: 1, itemBType: 1, itemBId: 1 },
  { unique: true, partialFilterExpression: { isMultiItem: true } }
);

const Interaction = mongoose.model("Interaction", InteractionSchema);
export default Interaction;
