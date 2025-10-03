import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: "Quiestion" },
    selectedOption: { type: String, enum: ["A", "B", "C", "D"] },
    isCorrect: Boolean,
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    attemptBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
    answers: [answerSchema],
    percentage: Number,
    timeTaken: Number, // in seconds
    progressStatus: {
      type: String,
      enum: Object.values(enumConfig.progressStatusEnums),
      default: enumConfig.progressStatusEnums.IN_PROGRESS,
    },
    resultStatus: {
      type: String,
      enum: Object.values(enumConfig.resultStatusEnums),
      default: enumConfig.resultStatusEnums.PENDING,
    },
    completedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

const ResultModel = mongoose.model("Result", resultSchema);
export default ResultModel;
