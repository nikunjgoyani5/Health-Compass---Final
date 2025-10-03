import mongoose from "mongoose";

const quizSchema = new mongoose.Schema(
  {
    title: String,
    image: { type: String, default: null },
    description: String,
    totalQuestions: Number,
    timeLimit: Number, // in seconds
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const QuizModel = mongoose.model("Quiz", quizSchema);
export default QuizModel;
