import mongoose from "mongoose";
import { DISCLAIMER_TYPES_ARRAY, DISCLAIMER_TYPES_INFO } from "../config/disclaimer.config.js";

const disclaimerSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: DISCLAIMER_TYPES_ARRAY,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Indexes for better performance
disclaimerSchema.index({ type: 1, isActive: 1 });
disclaimerSchema.index({ createdAt: -1 });

// Virtual for getting type display name
disclaimerSchema.virtual("typeDisplayName").get(function() {
  const typeInfo = DISCLAIMER_TYPES_INFO.find(info => info.value === this.type);
  return typeInfo ? typeInfo.label : this.type;
});

// Pre-save middleware
disclaimerSchema.pre("save", function(next) {
  next();
});

// Static method to get disclaimer by type
disclaimerSchema.statics.getByType = function(type) {
  return this.findOne({ 
    type, 
    isActive: true 
  }).sort({ createdAt: -1 });
};

// Static method to get all active disclaimers
disclaimerSchema.statics.getAllActive = function() {
  return this.find({ 
    isActive: true 
  }).sort({ type: 1, createdAt: -1 });
};

// Static method to get disclaimer types
disclaimerSchema.statics.getTypes = function() {
  return DISCLAIMER_TYPES_INFO;
};

// Instance method to get formatted content
disclaimerSchema.methods.getFormattedContent = function() {
  return {
    id: this._id,
    type: this.type,
    typeDisplayName: this.typeDisplayName,
    title: this.title,
    content: this.content,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Instance method to deactivate
disclaimerSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Instance method to activate
disclaimerSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

const Disclaimer = mongoose.model("Disclaimer", disclaimerSchema);

export default Disclaimer;
