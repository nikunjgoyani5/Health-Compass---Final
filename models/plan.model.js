import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const PriceSchema = new mongoose.Schema(
  {
    label: { type: String }, // 'monthly', 'yearly', 'quarterly'...
    tag: { type: String, default: null }, // 'most popular', 'best value'...
    stripePriceId: { type: String, index: true },
    interval: {
      type: String,
      enum: Object.values(enumConfig.intervalEnum),
    },
    intervalCount: { type: Number, default: 1 }, // e.g., 1 year
    currency: { type: String, default: "USD", uppercase: true },
    amountCents: { type: Number }, // for UI only (truth = Stripe)
    isPrimary: { type: Boolean, default: false }, // highlight in UI
    trialDays: { type: Number, default: 0 },
    trialDescription: { type: String, default: null },

    discountType: {
      type: String,
      enum: Object.values(enumConfig.discountTypeEnum),
      default: null,
    },
    discountValue: { type: Number, default: 0 }, // % if percentage, amountCents if flat
    discountDescription: { type: String, default: null }, // e.g. "Save 20% for first 3 months"
    discountDurationMonths: { type: Number, default: 0 }, // optional, if promo is limited time
  },
  { _id: false }
);

/** Super-light feature matrix:
 * value can be boolean/number/string (tick/cross, limits, or note).
 */
const PlanSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String }, // 'Essential'
    slug: { type: String, lowercase: true },
    badge: { type: String }, // 'MOST POPULAR'
    rank: { type: Number, default: 0 },
    isActive: { type: Boolean, default: false },
    access: [
      { access_name: String, isIncluded: { type: Boolean, default: false } },
    ],
    includes: [
      { include_name: String, isIncluded: { type: Boolean, default: false } },
    ],
    adds: [{ add_name: String, isIncluded: { type: Boolean, default: false } }],
    prices: { type: [PriceSchema], default: [] }, // each maps to a Stripe price
    features: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    highlights: { type: [String], default: [] },
  },
  { timestamps: true }
);

PlanSchema.index({ isActive: 1, rank: 1 });

export default mongoose.model("Plan", PlanSchema);
