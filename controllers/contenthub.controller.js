import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import ContentHubModel from "../models/contenthub.model.js";
import fileUploadService from "../services/file.upload.service.js";
import enumConfig from "../config/enum.config.js";
import UserModel from "../models/user.model.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";
import {
  formatMmSs,
  getDurationFromBuffer,
} from "../helper/detect.video.duration.helper.js";
import markdownIt from "markdown-it";
import mongoose from "mongoose";

// -----------------------------
// Create Content Hub
// -----------------------------
// This endpoint allows administrators to create a new content hub. The content may include articles, blogs, videos, or health tips. It also handles file uploads (images and videos) and converts markdown to HTML.
const createContentHub = async (req, res) => {
  try {
    const data = req.body;
    data.createdBy = req.user._id;
    const files = req.files || [];

    // ✅ Setup Markdown parser once
    const md = markdownIt({
      html: true,
      linkify: true,
      typographer: true,
    });

    // ✅ Description (Markdown/HTML -> HTML)
    if (data.description) {
      const hasHtmlTags = /<([A-Za-z][A-Za-z0-9]*)\b[^>]*>(.*?)<\/\1>/.test(
        data.description
      );
      if (hasHtmlTags) {
        data.description = md.render(data.description);
      }
      // else keep as it is (plain text/markdown)
    }

    // ✅ Blog Body (Markdown/HTML -> HTML)
    if (data.blogBody) {
      data.blogBody = md.render(data.blogBody);
    }

    if (data.doctorId) {
      const doctor = await UserModel.findOne({
        _id: data.doctorId,
        is_deleted: false,
        role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
      });
      if (!doctor) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.NOT_FOUND,
          message: "Doctor not found.",
        });
      }
    }

    // 1) Image upload
    const imageFile = files.find((f) => f.fieldname === "image");
    data.image = imageFile
      ? await fileUploadService.uploadFile({
          buffer: imageFile.buffer,
          mimetype: imageFile.mimetype,
        })
      : null;

    // 2) Video upload + duration
    const mainVideoFile = files.find((f) => f.fieldname === "video");
    if (mainVideoFile) {
      // Upload first (your existing flow)
      data.video = await fileUploadService.uploadFile({
        buffer: mainVideoFile.buffer,
        mimetype: mainVideoFile.mimetype,
      });

      // Duration from buffer (stream -> fallback temp file)
      try {
        const secs = await getDurationFromBuffer(mainVideoFile.buffer);
        data.video_duration = formatMmSs(secs); // e.g., "1:20"
      } catch (durErr) {
        // If duration fails, still proceed with upload; set null or "0:00"
        console.error("Failed to read video duration:", durErr);
        data.video_duration = null; // or "0:00"
      }
    } else {
      data.video = null;
      data.video_duration = null;
    }

    const result = await ContentHubModel.create(data);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.ADD_CONTENT_HUB,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      status: true,
      data: result,
      message: "Content hub created successfully.",
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to create content-hub.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      data: null,
      message: "Internal server error",
    });
  }
};

// -----------------------------
// Get Content Hub by Type
// -----------------------------
// This endpoint allows users to fetch content from the content hub based on the specified type (e.g., health tips, featured videos).
// It can also return a specific content item if an ID is provided.
const getContent = async (req, res) => {
  try {
    const filter = {};
    const { type, id } = req.query;
    const userId = req.user._id;

    if (type) filter.type = type;

    let current = null;
    let list = [];

    const isSpecialType = type === "health_tips" || type === "featured_videos";

    if (isSpecialType && id) {
      // ✅ Get the current content
      current = await ContentHubModel.findOne({ _id: id, ...filter })
        .populate("doctorId", "fullName email qualifications profileImage")
        .lean();

      // Add isLike field
      if (current) {
        current.isLike = current.likes?.some(
          (like) => like.toString() === userId.toString()
        );
      }

      // ✅ Get all content (including current)
      list = await ContentHubModel.find({
        ...filter,
      })
        .populate("doctorId", "fullName email qualifications profileImage")
        .sort({ createdAt: -1 })
        .lean();

      // Add isLike field for list
      list = list.map((item) => ({
        ...item,
        isLike: item.likes?.some(
          (like) => like.toString() === userId.toString()
        ),
      }));

      return apiResponse({
        res,
        status: true,
        statusCode: StatusCodes.OK,
        message: "Content fetched successfully.",
        body: {
          current: current || {},
          list: list || [],
        },
      });
    }

    // ✅ For normal flow
    let data = await ContentHubModel.find(filter)
      .populate("doctorId", "fullName email qualifications profileImage")
      .sort({ createdAt: -1 })
      .lean();

    // Add isLike field for all items
    data = data.map((item) => ({
      ...item,
      isLike: item.likes?.some((like) => like.toString() === userId.toString()),
    }));

    await activityLogService.createActivity({
      userId: userId,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_CONTENT_HUB,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Content fetched successfully.",
      body: data,
    });
  } catch (error) {
    console.error("getContent error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to fetch content-hub.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
    });
  }
};

// -----------------------------
// Update Content Hub
// -----------------------------
// This endpoint allows administrators to update an existing content hub, including updating descriptions, blog content, uploading images or videos, and adding additional content.
const updateContentHub = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const files = req.files || [];

    const findContent = await ContentHubModel.findById(id);
    if (!findContent) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Content not found.",
        data: null,
      });
    }

    // ✅ Markdown Parser (only once)
    const md = markdownIt({
      html: true,
      linkify: true,
      typographer: true,
    });

    // ✅ Render description/blogBody if provided
    if (data.description) {
      const hasHtmlTags = /<([A-Za-z][A-Za-z0-9]*)\b[^>]*>(.*?)<\/\1>/.test(
        data.description
      );
      if (hasHtmlTags) {
        data.description = md.render(data.description);
      }
      // else keep as it is (plain text/markdown)
    }

    if (data.blogBody) {
      data.blogBody = md.render(data.blogBody);
    }

    if (data.doctorId) {
      const doctor = await UserModel.findOne({
        _id: data.doctorId,
        is_deleted: false,
        role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
      });
      if (!doctor) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.NOT_FOUND,
          message: "Doctor not found.",
        });
      }
    }

    // ---------- Handle Image Upload ----------
    const imageFile = files.find((file) => file.fieldname === "image");
    if (imageFile) {
      if (findContent.image) {
        await fileUploadService.deleteFile({ url: findContent.image });
      }
      data.image = await fileUploadService.uploadFile({
        buffer: imageFile.buffer,
        mimetype: imageFile.mimetype,
      });
    }

    // ---------- Handle Featured Videos ----------
    if (findContent.type === enumConfig.contentHubTypeEnums.FEATURED_VIDEOS) {
      const videoFile = files.find((file) => file.fieldname === "video");
      if (videoFile) {
        // delete old video if exists
        if (findContent.video) {
          await fileUploadService.deleteFile({ url: findContent.video });
        }
        // upload new video
        data.video = await fileUploadService.uploadFile({
          buffer: videoFile.buffer,
          mimetype: videoFile.mimetype,
        });

        // set duration in m:ss (e.g., "1:20")
        try {
          const secs = await getDurationFromBuffer(videoFile.buffer);
          data.video_duration = formatMmSs(secs);
        } catch (durErr) {
          console.error("Failed to read video duration:", durErr);
          // keep previous duration if exists, otherwise null
          data.video_duration = findContent.video_duration ?? null;
        }
      }
      // if no new videoFile, do not touch existing video or duration
    }

    // ---------- Handle Health QnA ----------
    else if (findContent.type === enumConfig.contentHubTypeEnums.HEALTH_QNA) {
      try {
        if (typeof data.qna === "string") data.qna = JSON.parse(data.qna);
      } catch (err) {
        console.error("Invalid QnA JSON:", err);
        data.qna = [];
      }

      if (Array.isArray(data.qna)) {
        data.qna = [...(findContent.qna || []), ...data.qna];
      } else {
        data.qna = findContent.qna || [];
      }
    }

    // ---------- Save Updated Content ----------
    const result = await ContentHubModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.UPDATE_CONTENT_HUB,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Content updated successfully.",
      statusCode: StatusCodes.OK,
      data: result,
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user._._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to update content-hub.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

// -----------------------------
// Delete Content Hub
// -----------------------------
// This endpoint allows administrators to delete a content hub and its associated media (images, videos).
// It also handles the removal of the content from the system.
const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const findContent = await ContentHubModel.findById(id);
    if (!findContent) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Content not found.",
        data: null,
      });
    }

    // Delete main image if exists
    if (findContent.image) {
      await fileUploadService.deleteFile({ url: findContent.image });
    }

    // Delete video if exists
    if (findContent.video) {
      await fileUploadService.deleteFile({ url: findContent.video });
    }

    // Finally delete the document
    await ContentHubModel.findByIdAndDelete(id);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.DELETE_CONTENT_HUB,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Content and associated files deleted successfully.",
      data: null,
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CONTENT_HUB,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to delete content-hub record.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};

// -----------------------------
// Toggle Like/Dislike Post
// -----------------------------
// This endpoint allows users to toggle like or dislike on a content hub post. It returns the updated like status along with the total number of likes for the post.
const toggleLike = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Invalid or missing Post Id",
      });
    }

    const post = await ContentHubModel.findById(postId);

    if (!post) {
      return apiResponse({
        res,
        statusCode: StatusCodes.NOT_FOUND,
        status: false,
        message: "Post not found",
      });
    }

    // Check if already liked
    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      // Dislike (remove like)
      post.likes.pull(userId);
      await post.save();

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        data: {
          totalLikes: post.likes.length,
          isLiked: false,
        },
        message: "Post disliked successfully.",
      });
    } else {
      // Like (add userId)
      post.likes.push(userId);
      await post.save();

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        data: {
          totalLikes: post.likes.length,
          isLiked: true,
        },
        message: "Post liked successfully.",
      });
    }
  } catch (error) {
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Something went wrong.",
      data: error.message,
    });
  }
};

// -----------------------------
// Get User Liked Posts
// -----------------------------
// This endpoint allows users to fetch all posts from the content hub that they have liked. It returns the liked posts with associated information.
const getUserLikedPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type } = req.query;

    // Filter for posts liked by this user
    const filter = {
      likes: { $in: [userId] },
    };

    // If "type" filter is provided, apply it
    if (type) {
      filter.type = type;
    }

    const likedPosts = await ContentHubModel.find(filter)
      .populate("createdBy", "fullName email profileImage")
      .populate("doctorId", "fullName email qualifications profileImage")
      .sort({ createdAt: -1 });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      data: likedPosts,
      message: "Liked posts fetched successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Something went wrong.",
      data: error.message,
    });
  }
};

export default {
  createContentHub,
  getContent,
  updateContentHub,
  deleteRecord,
  toggleLike,
  getUserLikedPosts,
};
