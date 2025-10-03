import CaregiverNote from "../models/caregiverNotes.model.js";
import UserModel from "../models/user.model.js";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import helper from "../helper/common.helper.js";
import mongoose from "mongoose";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";

// -----------------------------
// Add Caregiver Note
// -----------------------------
// This endpoint allows caregivers to add notes for a user they care for.
const addCaregiverNote = async (req, res) => {
  try {
    const caregiverId = req.user.id;
    const { userId, title, note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid user ID.",
      });
    }

    // Check caregiver existence & not deleted
    const caregiver = await UserModel.findOne({
      _id: caregiverId,
      is_deleted: false,
    })
      .select("iCareFor")
      .lean();

    if (!caregiver) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "Caregiver not found or deleted.",
      });
    }

    // Check user existence & not deleted
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
    }).lean();

    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "User not found or deleted.",
      });
    }

    const isCaregiver = caregiver?.iCareFor?.some(
      (id) => String(id) === String(userId)
    );

    if (!isCaregiver) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You are not a caregiver for this user.",
      });
    }

    const newNote = await CaregiverNote.create({
      caregiver: caregiverId,
      user: userId,
      title,
      note,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.ADD_CAREGIVER_NOTE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: "Caregiver note added successfully.",
      data: newNote,
    });
  } catch (error) {
    console.error("Error adding caregiver note:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to add caregiver note.",
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
// Get Caregiver Notes for Me
// -----------------------------
// This endpoint allows users to fetch notes added by their caregivers based on filters like date and caregiver.
const getCaregiverNotesForMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { caregiverId, date } = req.query;

    if (caregiverId && !mongoose.Types.ObjectId.isValid(caregiverId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid caregiver ID.",
      });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid user ID.",
      });
    }

    if (caregiverId)
      console.log("📌 Specific Caregiver ID Requested:", caregiverId);
    if (date) console.log("📅 Date Filter Requested:", date);

    const user = await UserModel.findById(userId).select("myCaregivers").lean();
    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "User not found.",
      });
    }

    let filter = { user: new mongoose.Types.ObjectId(userId) };

    if (caregiverId) {
      const isMyCaregiver = user.myCaregivers.some(
        (id) => String(id) === String(caregiverId)
      );
      if (!isMyCaregiver) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.FORBIDDEN,
          message: "This caregiver is not authorized for your data.",
        });
      }
      filter.caregiver = new mongoose.Types.ObjectId(caregiverId);
    } else {
      filter.caregiver = {
        $in: user.myCaregivers.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    if (date) {
      const [year, month, day] = date.split("/").map(Number);
      const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
      filter.createdAt = { $gte: start, $lte: end };
    }

    const pagination = helper.paginationFun(req.query);

    const notes = await CaregiverNote.find(filter)
      .populate("caregiver", "fullName email profileImage")
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit);

    const totalCount = await CaregiverNote.countDocuments(filter);

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: totalCount,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.GET_CAREGIVER_NOTE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Caregiver notes fetched successfully.",
      data: notes,
      pagination: paginationData,
    });
  } catch (error) {
    console.error("❌ Error fetching caregiver notes:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to fetch caregiver note.",
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
// Get Caregiver Notes Sent
// -----------------------------
// This endpoint allows caregivers to fetch the notes they have sent for a user. It supports filtering by date and userId.
const getCaregiverNotesISent = async (req, res) => {
  try {
    const caregiverId = req.user.id;
    const { date, userId } = req.query;

    console.log("🩺 Logged-in Caregiver ID:", caregiverId);
    if (date) console.log("📅 Date Filter Requested:", date);
    if (userId) console.log("🎯 Filtering by specific userId:", userId);

    let filter = { caregiver: new mongoose.Types.ObjectId(caregiverId) };

    if (userId) {
      filter.user = new mongoose.Types.ObjectId(userId);
    }

    if (date) {
      const [year, month, day] = date.split("/").map(Number);
      const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
      filter.createdAt = { $gte: start, $lte: end };
    }

    const pagination = helper.paginationFun(req.query);

    const notes = await CaregiverNote.find(filter)
      .populate("user", "fullName email profileImage")
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    const totalCount = await CaregiverNote.countDocuments(filter);

    const caregiverInfo = await UserModel.findById(caregiverId)
      .select("fullName email profileImage")
      .lean();

    const enrichedNotes = notes.map(
      ({ caregiver, ...noteWithoutCaregiver }) => ({
        ...noteWithoutCaregiver,
        you: caregiverInfo,
      })
    );

    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: totalCount,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.IS_SENT_CAREGIVER_NOTE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Notes you sent as a caregiver fetched successfully.",
      data: enrichedNotes,
      pagination: paginationData,
    });
  } catch (error) {
    console.error("❌ Error fetching sent notes:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to fetch caregiver note sent.",
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
// Update Caregiver Note
// -----------------------------
// This endpoint allows caregivers to update notes that they have added for users.
const updateCaregiverNote = async (req, res) => {
  try {
    const caregiverId = req.user.id;
    const { noteId } = req.params;
    const { title, note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid note ID.",
      });
    }

    const existingNote = await CaregiverNote.findById(noteId);

    if (!existingNote) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Caregiver note not found.",
      });
    }

    if (String(existingNote.caregiver) !== String(caregiverId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You are not authorized to update this note.",
      });
    }

    existingNote.title = title ?? existingNote.title;
    existingNote.note = note ?? existingNote.note;
    await existingNote.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: "Caregiver note updated successfully.",
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Caregiver note updated successfully.",
      data: existingNote,
    });
  } catch (error) {
    console.error("Error updating caregiver note:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to update caregiver note.",
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
// Delete Caregiver Note
// -----------------------------
// This endpoint allows caregivers to delete notes they previously added for users.
const deleteCaregiverNote = async (req, res) => {
  try {
    const caregiverId = req.user.id;
    const { noteId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid note ID.",
      });
    }

    const existingNote = await CaregiverNote.findById(noteId);

    if (!existingNote) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Caregiver note not found.",
      });
    }

    if (String(existingNote.caregiver) !== String(caregiverId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You are not authorized to delete this note.",
      });
    }

    await existingNote.deleteOne();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: activityDescriptions.ADMIN.SUCCESS.DELETE_CAREGIVER_NOTE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Caregiver note deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting caregiver note:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.CAREGIVER_NOTE,
      activityCategory: enumConfig.activityCategoryEnum.ADMIN,
      description: error.message || "Failed to delete caregiver note.",
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

export default {
  addCaregiverNote,
  getCaregiverNotesForMe,
  getCaregiverNotesISent,
  updateCaregiverNote,
  deleteCaregiverNote,
};
