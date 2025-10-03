import mongoose from "mongoose";

const friendSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    friendIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const FriendModel = mongoose.model("Friend", friendSchema);
export default FriendModel;
