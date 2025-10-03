import mongoose from "mongoose";

const journalingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    date: {
      type: Date,
      index: true,
    },

    // 🌱 Core Health Metrics
    mood: {
      type: Number,
    },
    exercise: {
      type: Number,
    },
    sleepQuality: {
      type: Number,
    },
    nutrition: {
      type: Number,
    },
    energyLevel: {
      type: Number,
    },
    stressLevel: {
      type: Number,
    },

    // 💧 Lifestyle & Body
    hydration: {
      type: Number,
    },
    painLevel: {
      type: Number,
    },
    steps: { type: Number },
    sedentaryAlert: {
      type: Boolean,
      default: false,
    },

    // 🧠 Mental & Emotional
    focus: {
      type: Number,
    },
    overallWellbeing: {
      type: Number,
    },
    anxietyLevel: {
      type: Number,
    },
    socialInteraction: { type: Number },

    // 💊 Medical Tracking
    medicationAdherence: { type: Number },

    // Notes
    healthNotes: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true }
);

journalingSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model("DailyHealthLog", journalingSchema);
