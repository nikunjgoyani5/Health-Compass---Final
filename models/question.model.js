import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
    timeLimitPerQue: { type: Number },
    questionText: String,
    options: {
      A: String,
      B: String,
      C: String,
      D: String,
    },
    correctAnswer: { type: String, enum: ["A", "B", "C", "D"] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const QuestionModel = mongoose.model("Quiestion", questionSchema);
export default QuestionModel;
