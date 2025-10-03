import mongoose from "mongoose";

// reusable enums
const options = {
  frequency4: ["Never", "Occasionally", "Frequently", "Nearly every day"],
  frequencyStress: ["Never", "Occasionally", "Frequently", "Constantly"],
  enjoy: ["Always", "Sometimes", "Rarely", "Never"],
  sleepQuality: ["Excellent", "Good", "Poor", "Very Poor"],
  connected: [
    "Very connected",
    "Somewhat connected",
    "Not very connected",
    "Completely isolated",
  ],
  coping: ["Very well", "Somewhat well", "Poorly", "Not at all"],
  yesNo: ["Yes", "Sometimes", "Rarely", "No"],
  yesMaybeNo: ["Yes", "Maybe", "No"],
};

const sectionSchema = new mongoose.Schema({
  sectionName: { type: String, required: true },
  answers: {
    type: Map,
    of: String,
  },
});

const mentalHealthSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sections: [sectionSchema],
    percentage: { type: Number, default: 0 },
    level: { type: String },
    advice: { type: String },
    answeredCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const MentalHealth = mongoose.model("MentalHealth", mentalHealthSchema);
export default MentalHealth;
