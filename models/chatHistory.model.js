import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "bot"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  normalized: {
    type: String,
    required: false,
  },
  language: {
    type: String,
    required: false,
  },
});

const chatHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    messages: [chatMessageSchema],
  },
  {
    timestamps: true,
  }
);

const ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);
export default ChatHistory;
