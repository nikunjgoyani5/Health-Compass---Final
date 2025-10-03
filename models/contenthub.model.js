import mongoose from "mongoose";
import enumConfig from "../config/enum.config.js";

const contentHubSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(enumConfig.contentHubTypeEnums),
      index: true,
    },

    // Common Fields
    title: { type: String, default: null },
    description: { type: String, default: null },
    image: { type: String, default: null },
    video: { type: String, default: null },
    video_duration: { type: String, default: null },

    // LatestArticles Specific
    shortDescription: { type: String, default: null },
    blogBody: { type: String, default: null },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // CommunitySuccessStories Specific
    communityName: { type: String, default: null },
    communityStatus: { type: String, default: null },

    // Health Q&A
    question: { type: String },
    answer: { type: String },

    // ✅ Likes Flow
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

const ContentHubModel = mongoose.model("ContentHub", contentHubSchema);
export default ContentHubModel;
