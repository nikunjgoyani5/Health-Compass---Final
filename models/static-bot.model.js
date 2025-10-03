import mongoose from "mongoose";

const promptSchema = new mongoose.Schema({
  prompt: { type: String },
  response: { type: String },
  refinedPrompt: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const StaticHealthBotSchema = new mongoose.Schema(
  {
    title: { type: String },
    description: { type: String },
    prompts: [promptSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const StaticHealthBot = mongoose.model(
  "StaticHealthBot",
  StaticHealthBotSchema
);

export default StaticHealthBot;
