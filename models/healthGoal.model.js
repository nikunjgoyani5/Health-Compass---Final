import mongoose from "mongoose";

const healthGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    dailySteps: { type: Number, default: 0 },
    calories: { type: Number, default: 0 },
    waterIntake: { type: Number, default: 0 },
    sleepTarget: { type: Number, default: 0 },
    weightTarget: { type: Number, default: 0 },
    enableGamification: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const HealthGoalModel = mongoose.model("HealthGoal", healthGoalSchema);
export default HealthGoalModel;
