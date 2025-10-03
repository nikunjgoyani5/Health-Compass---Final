import mongoose from "mongoose";
import slugify from "slugify";

const supplementTagSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
    },
    slug: {
      type: String,
      index: true,
    },
    category: {
      type: String,
      default: null,
    },
    color: {
      type: String,
      default: "#cccccc",
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Slugify on save
supplementTagSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

// Slugify on update
supplementTagSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();
  if (update.name) {
    update.slug = slugify(update.name, { lower: true, strict: true });
    this.setUpdate(update);
  }
  next();
});

const SupplementTag = mongoose.model("SupplementTag", supplementTagSchema);
export default SupplementTag;
