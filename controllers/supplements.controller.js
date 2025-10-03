import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import User from "../models/user.model.js";
import mongoose from "mongoose";
import { apiResponse } from "../helper/api-response.helper.js";
import { StatusCodes } from "http-status-codes";
import enumConfig from "../config/enum.config.js";
import SupplementModel from "../models/supplements.model.js";
import SupplementDetails from "../models/scraped-supplement.model.js";
import IngredientModel from "../models/ingredient.model.js";
import SupplementTag from "../models/supplement-tag.model.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";
import { logSupplementView } from "../services/logSupplement-view.service.js";
import { getIPv4Address } from "../helper/common.helper.js";
import fileUploadService from "../services/file.upload.service.js";
import Disclaimer from "../models/disclaimer.model.js";
import {
  buildScrapedMongoFilter,
  postFilterByIngredientNames,
  normalizeScrapedWithAI,
  normalizeScrapedBatch,
} from "../utils/supplementScraped.mapper.js";

// ---------- SCRAPED OWNER (populated createdBy for scraped) ----------
const SCRAPED_OWNER_ID = new mongoose.Types.ObjectId(
  process.env.SCRAPED_CREATOR_ID || "68b56e114592c05548bb2354"
);

// ✅ Small in-memory cache for 5 minutes to avoid repeated DB hit
let _scrapedOwnerCache = null;
let _scrapedOwnerFetchedAt = 0;
const _SCRAPED_OWNER_TTL_MS = 5 * 60 * 1000;

async function getScrapedOwnerLean() {
  const now = Date.now();
  if (
    _scrapedOwnerCache &&
    now - _scrapedOwnerFetchedAt < _SCRAPED_OWNER_TTL_MS
  ) {
    if (
      _scrapedOwnerCache &&
      now - _scrapedOwnerFetchedAt < _SCRAPED_OWNER_TTL_MS
    ) {
      return _scrapedOwnerCache;
    }
    const u = await User.findById(SCRAPED_OWNER_ID)
      .select("fullname email profileImage role")
      .lean();

    _scrapedOwnerCache = u
      ? {
          _id: u._id,
          email: u.email,
          profileImage: u.profileImage,
          role: u.role,
          fullname: u.fullname,
        }
      : {
          _id: SCRAPED_OWNER_ID,
          email: null,
          profileImage: null,
          role: ["admin"],
          fullname: "System Admin",
        };

    _scrapedOwnerFetchedAt = now;
    return _scrapedOwnerCache;
  }
}

// helpers (local to file)
const toCleanList = (arr = []) =>
  arr.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);

const uniqueCiSorted = (arr = []) => {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item); // preserve original casing of first occurrence
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
};

// Function to properly capitalize supplement names
const properCapitalize = (str) => {
  if (!str || typeof str !== "string") return str;

  // Handle special cases and clean up the string
  let cleaned = str.trim();

  // Remove extra quotes if present
  cleaned = cleaned.replace(/^["']|["']$/g, "");

  // Handle special formatting for chemical names and compounds
  if (cleaned.includes("-") || cleaned.includes(" ")) {
    return cleaned
      .split(/(\s|-)/) // Split on spaces and hyphens but keep the delimiters
      .map((part, index, array) => {
        // Skip delimiters (spaces and hyphens)
        if (part === " " || part === "-") return part;

        // Handle special cases
        if (part.toLowerCase() === "wle") return "WLE";
        if (part.toLowerCase() === "dafli") return "DAFLI";
        if (part.toLowerCase() === "baby") return "Baby";
        if (part.toLowerCase() === "shot") return "Shot";
        if (part.toLowerCase() === "vegan") return "Vegan";
        if (part.toLowerCase() === "moisture") return "Moisture";
        if (part.toLowerCase() === "pink") return "Pink";

        // Handle chemical compounds and complex names
        if (part.includes(",")) {
          return part
            .split(",")
            .map(
              (subPart) =>
                subPart.trim().charAt(0).toUpperCase() +
                subPart.trim().slice(1).toLowerCase()
            )
            .join(", ");
        }

        // Handle numbers and special characters
        if (/^[0-9]/.test(part)) {
          return part; // Keep numbers as is
        }

        // Handle acronyms (all caps if 2-4 characters and all letters)
        if (part.length <= 4 && /^[A-Za-z]+$/.test(part) && part.length >= 2) {
          return part.toUpperCase();
        }

        // Handle very short words (1-2 characters) - keep as is
        if (part.length <= 2) {
          return part.toUpperCase();
        }

        // Default capitalization: first letter uppercase, rest lowercase
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join("");
  }

  // Handle single words
  if (cleaned.toLowerCase() === "wle") return "WLE";
  if (cleaned.toLowerCase() === "dafli") return "DAFLI";
  if (cleaned.toLowerCase() === "baby") return "Baby";
  if (cleaned.toLowerCase() === "shot") return "Shot";
  if (cleaned.toLowerCase() === "vegan") return "Vegan";
  if (cleaned.toLowerCase() === "moisture") return "Moisture";
  if (cleaned.toLowerCase() === "pink") return "Pink";

  // Handle acronyms
  if (
    cleaned.length <= 4 &&
    /^[A-Za-z]+$/.test(cleaned) &&
    cleaned.length >= 2
  ) {
    return cleaned.toUpperCase();
  }

  // Handle very short words
  if (cleaned.length <= 2) {
    return cleaned.toUpperCase();
  }

  // Default: first letter uppercase, rest lowercase
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
};

// (optional) super-light memo cache (per-process)
let __filtersCache = { at: 0, payload: null };
const CACHE_MS = 60 * 1000; // 60s

// Create a new supplement
const createSupplement = async (req, res) => {
  try {
    const data = req.body;
    let file = req.file;

    const isAdmin = Array.isArray(req.user.role)
      ? req.user.role.includes(enumConfig.userRoleEnum.ADMIN)
      : req.user.role === enumConfig.userRoleEnum.ADMIN;

    data.createdByAdmin = isAdmin;
    data.createdBy = req.user.id;

    // 1. Check already existing
    const existing = await SupplementModel.findOne({
      productName: data.productName,
      brandName: data.brandName,
      createdBy: req.user.id,
    });

    if (existing) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "This supplement already exists.",
        data: null,
      });
    }

    // 2. Validate ingredients if provided
    if (data.ingredients && data.ingredients.length > 0) {
      const invalidIds = data.ingredients.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id)
      );

      if (invalidIds.length > 0) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Invalid ingredient ID(s): ${invalidIds.join(", ")}`,
          data: null,
        });
      }

      const ingredientDocs = await IngredientModel.find({
        _id: { $in: data.ingredients },
      });

      if (ingredientDocs.length !== data.ingredients.length) {
        const foundIds = ingredientDocs.map((doc) => doc._id.toString());
        const missingIds = data.ingredients.filter(
          (id) => !foundIds.includes(id)
        );

        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Ingredient(s) not found for ID(s): ${missingIds.join(
            ", "
          )}`,
          data: null,
        });
      }
    }

    // 3. Validate tags if provided
    if (data.tags && data.tags.length > 0) {
      const invalidTagIds = data.tags.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id)
      );

      if (invalidTagIds.length > 0) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Invalid tag ID(s): ${invalidTagIds.join(", ")}`,
          data: null,
        });
      }

      const tagDocs = await SupplementTag.find({
        _id: { $in: data.tags },
        active: true,
        isDeleted: false,
      });

      if (tagDocs.length !== data.tags.length) {
        const foundTagIds = tagDocs.map((doc) => doc._id.toString());
        const missingTagIds = data.tags.filter(
          (id) => !foundTagIds.includes(id)
        );

        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Tag(s) not found for ID(s): ${missingTagIds.join(", ")}`,
          data: null,
        });
      }
    }

    if (file) {
      data.image = await fileUploadService.uploadFile({
        mimetype: file.mimetype,
        buffer: file.buffer,
      });
    }

    const newSupplement = await SupplementModel.create(data);

    await newSupplement.save();

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADD_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: activityDescriptions.SUPPLEMENT.ADD_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: "Supplement added successfully.",
      data: newSupplement,
    });
  } catch (error) {
    console.error("Create Supplement Error:", error);
    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADD_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: error.message || "Failed to add supplement.",
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

// UPDATE
const updateSupplement = async (req, res) => {
  try {
    let file = req.file;

    const supplement = await SupplementModel.findById(req.params.id);
    if (!supplement) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Supplement not found.",
      });
    }

    // const isAdmin = req.user.role.includes("admin");
    // const isCreator =
    //   supplement.createdBy.toString() === req.user.id.toString();

    // if (!isAdmin && !isCreator) {
    //   return apiResponse({
    //     res,
    //     status: false,
    //     statusCode: StatusCodes.FORBIDDEN,
    //     message: "You are not authorized to update this supplement.",
    //   });
    // }

    // 🔍 Duplicate Check: productName + brandName + createdBy
    const existingSupplement = await SupplementModel.findOne({
      _id: { $ne: req.params.id },
      productName: req.body.productName,
      brandName: req.body.brandName,
      // createdBy: req.user.id,
    });

    if (existingSupplement) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "This supplement already exists.",
      });
    }

    // Validate ingredients if provided
    if (req.body.ingredients && req.body.ingredients.length > 0) {
      const invalidIds = req.body.ingredients.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id)
      );

      if (invalidIds.length > 0) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Invalid ingredient ID(s): ${invalidIds.join(", ")}`,
          data: null,
        });
      }

      const ingredientDocs = await IngredientModel.find({
        _id: { $in: req.body.ingredients },
      });

      if (ingredientDocs.length !== req.body.ingredients.length) {
        const foundIds = ingredientDocs.map((doc) => doc._id.toString());
        const missingIds = req.body.ingredients.filter(
          (id) => !foundIds.includes(id)
        );

        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Ingredient(s) not found for ID(s): ${missingIds.join(
            ", "
          )}`,
          data: null,
        });
      }
    }

    // Validate tags if provided
    if (req.body.tags && req.body.tags.length > 0) {
      const invalidTagIds = req.body.tags.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id)
      );

      if (invalidTagIds.length > 0) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Invalid tag ID(s): ${invalidTagIds.join(", ")}`,
          data: null,
        });
      }

      const tagDocs = await SupplementTag.find({
        _id: { $in: req.body.tags },
        active: true,
        isDeleted: false,
      });

      if (tagDocs.length !== req.body.tags.length) {
        const foundTagIds = tagDocs.map((doc) => doc._id.toString());
        const missingTagIds = req.body.tags.filter(
          (id) => !foundTagIds.includes(id)
        );

        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: `Tag(s) not found for ID(s): ${missingTagIds.join(", ")}`,
          data: null,
        });
      }
    }

    if (file) {
      if (supplement.image && supplement.image.startsWith("https://")) {
        await fileUploadService.deleteFile({ url: supplement.image });
      }
      req.body.image = await fileUploadService.uploadFile({
        mimetype: file.mimetype,
        buffer: file.buffer,
      });
    }

    const updated = await SupplementModel.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.UPDATE_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: activityDescriptions.SUPPLEMENT.UPDATE_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Supplement updated.",
      data: updated,
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.UPDATE_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: error.message || "Failed to update supplement.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Server error",
    });
  }
};

// DELETE
const deleteSupplement = async (req, res) => {
  try {
    const supplement = await SupplementModel.findById(req.params.id);

    if (!supplement) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Supplement not found.",
        data: null,
      });
    }

    // const isAdmin = req.user.role?.includes(enumConfig.userRoleEnum.ADMIN);

    // Admin can delete only admin-created supplements
    // if (supplement.createdByAdmin && isAdmin) {
    await SupplementModel.findByIdAndDelete(req.params.id);
    // }

    // // Users can delete only their own supplements
    // else if (
    //   !supplement.createdByAdmin &&
    //   supplement.createdBy.toString() === req.user.id.toString()
    // ) {
    //   await SupplementModel.findByIdAndDelete(req.params.id);
    // }

    // // Not allowed to delete
    // else {
    //   return apiResponse({
    //     res,
    //     status: false,
    //     statusCode: StatusCodes.FORBIDDEN,
    //     message: "You are not authorized to delete this supplement.",
    //     data: null,
    //   });
    // }

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DELETE_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: activityDescriptions.SUPPLEMENT.DELETE_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Supplement deleted successfully.",
      data: null,
    });
  } catch (error) {
    console.error("Delete Supplement Error:", error);
    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.DELETE_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: error.message || "Failed to delete supplement.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Server error",
      data: null,
    });
  }
};

// // Get a single supplement by ID
// const getSingleSupplement = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const supplement = await SupplementModel.findOne({ _id: id })
//       .populate("ingredients")
//       .populate("tags", "name slug category color")
//       .populate("createdBy", "fullname email profileImage");

//     if (!supplement) {
//       return apiResponse({
//         res,
//         status: false,
//         statusCode: StatusCodes.NOT_FOUND,
//         message: "Supplement not found.",
//       });
//     }

//     logSupplementView({
//       userId: req.user._id,
//       supplementId: supplement._id,
//       anonToken: req.headers["x-anon-token"] || null,
//       ip: getIPv4Address(req), // optional, converts ::1 to 127.0.0.1
//       referrer: req.headers["x-referrer"] || "direct",
//     });

//     await activityLogService.createActivity({
//       userId: req.user.id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.GET_SINGLE_SUPPLEMENT,
//       activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
//       description: activityDescriptions.SUPPLEMENT.FETCH_SINGLE_SUCCESS,
//       status: enumConfig.activityStatusEnum.SUCCESS,
//     });

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Supplement fetched successfully.",
//       data: supplement,
//     });
//   } catch (error) {
//     console.error("Get Single Supplement Error:", error);
//     await activityLogService.createActivity({
//       userId: req.user.id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.GET_SINGLE_SUPPLEMENT,
//       activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
//       description: error.message || "Failed to fetch single supplement.",
//       status: enumConfig.activityStatusEnum.ERROR,
//     });
//     return apiResponse({
//       res,
//       status: false,
//       statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
//       message: "Server error.",
//     });
//   }
// };

// // Get all supplements with search & pagination
// const getAllSupplements = async (req, res) => {
//   try {
//     const {
//       search = "",
//       page = 1,
//       limit = 10,
//       tags,
//       ingredients,
//       usageGroups,
//     } = req.query;
//     console.log("Get All Supplements Params:", {
//       tags,
//       ingredients,
//       usageGroups,
//     });
//     const userId = req.user.id;
//     const isAdmin = Array.isArray(req.user.role)
//       ? req.user.role.includes(enumConfig.userRoleEnum.ADMIN)
//       : req.user.role === enumConfig.userRoleEnum.ADMIN;
//     const parsedLimit = parseInt(limit);
//     const skip = (parseInt(page) - 1) * parsedLimit;
//     const regex = new RegExp(search, "i");

//     const searchFilter = search
//       ? {
//           $or: [
//             { productName: regex },
//             { description: regex },
//             { brandName: regex },
//           ],
//         }
//       : {};

//     let finalFilter;

//     if (isAdmin) {
//       // Admin: fetch only admin-created
//       finalFilter = {
//         createdByAdmin: true,
//         ...searchFilter,
//       };
//     } else {
//       // User: fetch both user-created and admin-created
//       finalFilter = {
//         $or: [{ createdByAdmin: true }, { createdBy: userId }],
//         ...searchFilter,
//       };
//     }

//     // Apply filters
//     if (tags) {
//       const tagNames = tags.split(",").map((t) => t.trim());
//       if (tagNames.length > 0) {
//         const tagData = await SupplementTag.find(
//           { name: { $in: tagNames }, isDeleted: false, active: true },
//           { _id: 1 }
//         );
//         const tagIds = tagData.map((t) => t._id);
//         if (tagIds.length > 0) {
//           finalFilter.tags = { $in: tagIds };
//         }
//       }
//     }
//     if (ingredients) {
//       const ingreNames = ingredients.split(",").map((i) => i.trim());
//       if (ingreNames.length > 0 && !ingreNames.includes("All Types")) {
//         const ingreData = await IngredientModel.find(
//           { name: { $in: ingreNames } },
//           { _id: 1 }
//         );
//         const ingIds = ingreData.map((i) => i._id);
//         if (ingIds.length > 0) {
//           finalFilter.ingredients = { $in: ingIds };
//         }
//       }
//     }
//     if (usageGroups) {
//       finalFilter.usageGroup = { $in: [usageGroups] };
//     }

//     const totalItems = await SupplementModel.countDocuments(finalFilter);
//     const supplements = await SupplementModel.find(finalFilter)
//       .populate("ingredients", "name aliases")
//       .populate("tags", "name slug category color")
//       .populate("createdBy", "fullname email profileImage role")
//       .sort({ createdByAdmin: -1, createdAt: -1 })
//       .skip(skip)
//       .limit(parsedLimit);

//     await activityLogService.createActivity({
//       userId: req.user.id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.GET_ALL_SUPPLEMENT,
//       activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
//       description: activityDescriptions.SUPPLEMENT.FETCH_ALL_SUCCESS,
//       status: enumConfig.activityStatusEnum.SUCCESS,
//     });

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Supplements fetched successfully.",
//       pagination: {
//         page: Number(page),
//         limit: parsedLimit,
//         totalItems,
//         totalPages: Math.ceil(totalItems / parsedLimit),
//       },
//       data: supplements,
//     });
//   } catch (error) {
//     console.error("Get All Supplements Error:", error);
//     await activityLogService.createActivity({
//       userId: req.user.id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.GET_ALL_SUPPLEMENT,
//       activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
//       description: error.message || "Failed to fetch all supplement.",
//       status: enumConfig.activityStatusEnum.ERROR,
//     });
//     return apiResponse({
//       res,
//       status: false,
//       statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
//       message: "Server error.",
//     });
//   }
// };

// // Get all supplement filters
// const getAllSupplementFilters = async (req, res) => {
//   try {
//     // Tags
//     const tags = await SupplementTag.find({ active: true, isDeleted: false })
//       .select("name -_id")
//       .lean();

//     // Ingredients
//     const ingredients = await IngredientModel.find({})
//       .select("name -_id")
//       .lean();

//     // Usage groups (collect distinct values from all supplements)
//     const usageGroups = await SupplementModel.distinct("usageGroup", {
//       isAvailable: true,
//     });

//     await activityLogService.createActivity({
//       userId: req.user.id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType:
//         enumConfig.activityTypeEnum.SUPPLEMENT.GET_ALL_SUPPLEMENT_FILTERS,
//       activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
//       description: "Supplement filters fetched successfully.",
//       status: enumConfig.activityStatusEnum.SUCCESS,
//     });

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Supplement filters fetched successfully.",
//       data: {
//         tags: tags.map((t) => t.name),
//         ingredients: ingredients.map((i) => i.name),
//         usageGroups: usageGroups || [],
//       },
//     });
//   } catch (error) {
//     console.error("Get All Supplements Filters Error:", error);
//     await activityLogService.createActivity({
//       userId: req.user.id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType:
//         enumConfig.activityTypeEnum.SUPPLEMENT.GET_ALL_SUPPLEMENT_FILTERS,
//       activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
//       description: error.message || "Failed to fetch all supplement filters.",
//       status: enumConfig.activityStatusEnum.ERROR,
//     });
//     return apiResponse({
//       res,
//       status: false,
//       statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
//       message: "Server error.",
//     });
//   }
// };

const getSingleSupplement = async (req, res) => {
  try {
    const { id } = req.params;

    const isObjId = mongoose.Types.ObjectId.isValid(id);
    const isNumeric = /^\d+$/.test(id);

    // 1) Try manual/admin model first
    let supplement = null;
    if (isObjId) {
      supplement = await SupplementModel.findById(id)
        .populate("ingredients")
        .populate("tags", "name slug category color")
        .populate("createdBy", "fullname email profileImage role")
        .lean();

      if (supplement) {
        supplement = {
          ...supplement,
          ingredients: Array.isArray(supplement.ingredients)
            ? supplement.ingredients
            : [],
          tags: Array.isArray(supplement.tags) ? supplement.tags : [],
          createdByAdmin: !!supplement.createdByAdmin,
          isAvailable:
            typeof supplement.isAvailable === "boolean"
              ? supplement.isAvailable
              : true,
          source: "manual",
        };
      }
    }

    // 2) Not found → try scraped (by _id or sourceId numeric)
    if (!supplement) {
      const or = [];
      if (isObjId) or.push({ _id: id });
      if (isNumeric) or.push({ sourceId: id });

      const scraped = await SupplementDetails.findOne(
        or.length ? { $or: or } : { _id: null }
      ).lean();
      if (!scraped) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.NOT_FOUND,
          message: "Supplement not found.",
        });
      }

      // Normalize to manual-like shape (AI with timeout + fallback)
      const norm = await normalizeScrapedWithAI(scraped);

      // ✅ Inject FE-safe defaults & full createdBy object
      const scrapedOwner = await getScrapedOwnerLean();
      supplement = {
        ...norm,
        ingredients: Array.isArray(norm.ingredients) ? norm.ingredients : [],
        tags: Array.isArray(norm.tags) ? norm.tags : [],
        createdBy: {
          _id: scrapedOwner._id,
          email: scrapedOwner.email,
          profileImage: scrapedOwner.profileImage,
          role: scrapedOwner.role,
          fullname: scrapedOwner.fullname,
        },
        createdByAdmin: true,
        isAvailable:
          typeof norm.isAvailable === "boolean" ? norm.isAvailable : true,
        source: "scraped",
      };

      // Strong field defaults (parity with manual)
      if (!("servingsPerContainer" in supplement))
        supplement.servingsPerContainer = null;
      if (!("servingSize" in supplement)) supplement.servingSize = null;
      if (!("usageGroup" in supplement)) supplement.usageGroup = [];
      if (!("image" in supplement)) supplement.image = null;
      if (!("_id" in supplement)) supplement._id = scraped._id; // ensure id present
      if (!("productName" in supplement)) {
        supplement.productName =
          scraped?.data?.fullName ||
          scraped?.data?.bundleName ||
          "Unknown Product";
      }
      if (!("brandName" in supplement)) {
        supplement.brandName = scraped?.data?.brandName || "Unknown Brand";
      }
      if (!("description" in supplement)) {
        const notes = Array.isArray(scraped?.data?.statements)
          ? scraped.data.statements
              .map((s) => s?.notes)
              .filter(Boolean)
              .join(" ")
          : "";
        supplement.description = notes || "";
      }
    }

    // 3) Fetch Supplement Disclaimer
    const supplementDisclaimer = await Disclaimer.getByType(
      "supplement_disclaimer"
    );

    // 4) Log view (safe)
    try {
      logSupplementView({
        userId: req.user?._id || req.user?.id || null,
        supplementId: supplement?._id,
        anonToken: req.headers["x-anon-token"] || null,
        ip: getIPv4Address(req),
        referrer: req.headers["x-referrer"] || "direct",
      });
    } catch (e) {
      console.warn("⚠️ logSupplementView failed:", e?.message);
    }

    // 5) Add Disclaimer to supplement (only if isActive: true)
    const supplementWithDisclaimer = {
      ...supplement,
      disclaimer:
        supplementDisclaimer && supplementDisclaimer.isActive === true
          ? {
              id: supplementDisclaimer._id,
              type: supplementDisclaimer.type,
              title: supplementDisclaimer.title,
              content: supplementDisclaimer.content,
              isActive: supplementDisclaimer.isActive,
            }
          : null,
    };

    // 6) Activity log
    try {
      await activityLogService.createActivity({
        userId: req.user.id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.GET_SINGLE_SUPPLEMENT,
        activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
        description: activityDescriptions.SUPPLEMENT.FETCH_SINGLE_SUCCESS,
        status: enumConfig.activityStatusEnum.SUCCESS,
      });
    } catch (e) {
      console.warn("⚠️ activityLog failed:", e?.message);
    }

    // 7) Return
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Supplement fetched successfully.",
      data: supplementWithDisclaimer,
    });
  } catch (error) {
    console.error("Get Single Supplement Error:", error);
    try {
      await activityLogService.createActivity({
        userId: req.user.id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.GET_SINGLE_SUPPLEMENT,
        activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
        description: error.message || "Failed to fetch single supplement.",
        status: enumConfig.activityStatusEnum.ERROR,
      });
    } catch (_) {}
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Server error.",
    });
  }
};

const getAllSupplements = async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      tags,
      ingredients,
      usageGroups,
    } = req.query;

    // Debug logging
    console.log("🔍 Supplement List API - Query Params:", {
      search,
      page,
      limit,
      tags,
      ingredients,
      usageGroups,
    });

    const userId = req.user.id;
    const isAdmin = Array.isArray(req.user.role)
      ? req.user.role.includes(enumConfig.userRoleEnum.ADMIN)
      : req.user.role === enumConfig.userRoleEnum.ADMIN;

    // ---------- Fetch Supplement Disclaimer ----------
    const supplementDisclaimer = await Disclaimer.getByType(
      "supplement_disclaimer"
    );

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const skip = (parsedPage - 1) * parsedLimit;
    const regex = search ? new RegExp(search, "i") : null;

    // ---------- Manual filter ----------
    const manualMatch = {
      ...(isAdmin
        ? { createdByAdmin: true }
        : { $or: [{ createdByAdmin: true }, { createdBy: userId }] }),
    };
    if (regex) {
      // Create a separate search filter that will be applied after the main filter
      const searchFilter = {
        $or: [
          { productName: regex },
          { description: regex },
          { brandName: regex },
        ],
      };

      // If there's already an $or condition, combine them properly
      if (manualMatch.$or) {
        manualMatch.$and = [{ $or: manualMatch.$or }, searchFilter];
        delete manualMatch.$or;
      } else {
        Object.assign(manualMatch, searchFilter);
      }
    }

    // TAG filter (manual refs only)
    if (tags) {
      const tagNames = String(tags)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tagNames.length > 0) {
        // Apply proper capitalization to filter values
        const capitalizedTagNames = tagNames.map(properCapitalize);

        // Use case-insensitive matching for both original and capitalized names
        const tagData = await SupplementTag.find(
          {
            $or: [
              { name: { $in: tagNames }, isDeleted: false, active: true },
              {
                name: { $in: capitalizedTagNames },
                isDeleted: false,
                active: true,
              },
            ],
          },
          { _id: 1 }
        );
        const tagIds = tagData.map((t) => t._id);
        manualMatch.tags = tagIds.length > 0 ? { $in: tagIds } : { $in: [] };
      }
    }

    // INGREDIENT filter (manual refs only) + prepare name filter for scraped
    let ingredientNamesForScraped = null;
    if (ingredients) {
      const ingreNames = String(ingredients)
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);
      if (ingreNames.length > 0 && !ingreNames.includes("All Types")) {
        // Apply proper capitalization to filter values
        const capitalizedIngreNames = ingreNames.map(properCapitalize);
        ingredientNamesForScraped = capitalizedIngreNames;

        // Use case-insensitive matching for both original and capitalized names
        const ingreData = await IngredientModel.find(
          {
            $or: [
              { name: { $in: ingreNames } },
              { name: { $in: capitalizedIngreNames } },
            ],
          },
          { _id: 1 }
        );
        const ingIds = ingreData.map((i) => i._id);
        manualMatch.ingredients =
          ingIds.length > 0 ? { $in: ingIds } : { $in: [] };
      }
    }

    // USAGE GROUPS filter (handle multiple groups like tags and ingredients)
    let usageGroupsArray = [];
    if (usageGroups) {
      usageGroupsArray = String(usageGroups)
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

      if (usageGroupsArray.length > 0) {
        // Apply proper capitalization to filter values
        const capitalizedUsageGroups = usageGroupsArray.map(properCapitalize);

        // Use case-insensitive matching for both original and capitalized names
        manualMatch.usageGroup = {
          $in: [...usageGroupsArray, ...capitalizedUsageGroups],
        };
      }
    }

    // ---------- Scraped filter ----------
    const scrapedMatch = buildScrapedMongoFilter({
      search,
      usageGroups: usageGroupsArray,
    });

    let scrapedIngOr = null;
    if (ingredientNamesForScraped?.length) {
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Create regex patterns for both original and capitalized names
      const allIngredientNames = [...ingredientNamesForScraped];
      const ingNameRegex = allIngredientNames.map(
        (n) => new RegExp(`^${escapeRegex(n)}$`, "i")
      );
      scrapedIngOr = [
        { "data.ingredientRows.name": { $in: ingNameRegex } },
        { "data.ingredientRows.ingredientGroup": { $in: ingNameRegex } },
        { "data.otheringredients.ingredients.name": { $in: ingNameRegex } },
        {
          "data.otheringredients.ingredients.ingredientGroup": {
            $in: ingNameRegex,
          },
        },
      ];
    }

    // ---------- Projections (light shape for pagination union) ----------
    const manualProject = {
      _id: 1,
      createdAt: 1,
      updatedAt: 1,
      createdByAdmin: 1,
      createdBy: 1,
      productName: 1,
      brandName: 1,
      description: 1,
      image: 1,
      isAvailable: 1,
      usageGroup: 1,
      source: { $literal: "manual" },
    };

    const scrapedProject = {
      _id: 1,
      createdAt: 1,
      updatedAt: 1,
      createdByAdmin: { $literal: true },
      // This will be overridden in hydration to a full user object:
      createdBy: { $literal: SCRAPED_OWNER_ID },
      productName: { $ifNull: ["$data.fullName", "$data.bundleName"] },
      brandName: { $ifNull: ["$data.brandName", "Unknown Brand"] },
      description: {
        $trim: {
          input: {
            $reduce: {
              input: {
                $filter: {
                  input: "$data.statements",
                  as: "s",
                  cond: { $ne: ["$$s.notes", null] },
                },
              },
              initialValue: "",
              in: {
                $concat: [
                  "$$value",
                  { $cond: [{ $eq: ["$$value", ""] }, "", " "] },
                  { $toString: "$$this.notes" },
                ],
              },
            },
          },
        },
      },
      image: "$data.thumbnail",
      isAvailable: { $not: ["$data.offMarket"] },
      usageGroup: { $ifNull: ["$data.targetGroups", []] },
      source: { $literal: "scraped" },
    };

    // ---------- Combined pagination with $unionWith ----------
    const SCRAPED_COLL = SupplementDetails.collection.collectionName;

    const pipeline = [
      { $match: manualMatch },
      { $project: manualProject },
      {
        $unionWith: {
          coll: SCRAPED_COLL,
          pipeline: [
            { $match: scrapedMatch },
            ...(scrapedIngOr ? [{ $match: { $or: scrapedIngOr } }] : []),
            { $project: scrapedProject },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parsedLimit },
    ];

    const pageSliceLight = await SupplementModel.aggregate(pipeline);

    // ---------- Post-hydration ----------
    const manualIds = [];
    const scrapedIds = [];
    for (const it of pageSliceLight) {
      if (it.source === "manual") manualIds.push(it._id);
      else scrapedIds.push(it._id);
    }

    let hydratedManual = [];
    if (manualIds.length) {
      hydratedManual = await SupplementModel.find({ _id: { $in: manualIds } })
        .populate("ingredients", "name aliases")
        .populate("tags", "name slug category color")
        .populate("createdBy", "fullname email profileImage role")
        .lean();
    }

    let hydratedScraped = [];
    if (scrapedIds.length) {
      const rawScraped = await SupplementDetails.find(
        { _id: { $in: scrapedIds } },
        {
          "data.fullName": 1,
          "data.bundleName": 1,
          "data.brandName": 1,
          "data.statements": 1,
          "data.targetGroups": 1,
          "data.servingsPerContainer": 1,
          "data.servingSizes": 1,
          "data.otheringredients.ingredients": 1,
          "data.ingredientRows": 1,
          "data.thumbnail": 1,
          "data.offMarket": 1,
          createdAt: 1,
          updatedAt: 1,
        }
      ).lean();

      hydratedScraped = await normalizeScrapedBatch(rawScraped);

      // ✅ Inject a fully populated admin user as createdBy object
      const scrapedOwner = await getScrapedOwnerLean();

      hydratedScraped = hydratedScraped.map((x) => ({
        ...x,
        ingredients: Array.isArray(x.ingredients) ? x.ingredients : [],
        tags: Array.isArray(x.tags) ? x.tags : [],
        createdBy: {
          _id: scrapedOwner._id,
          email: scrapedOwner.email,
          profileImage: scrapedOwner.profileImage,
          role: scrapedOwner.role,
          fullname: scrapedOwner.fullname,
        },
        createdByAdmin: true,
        isAvailable: typeof x.isAvailable === "boolean" ? x.isAvailable : true,
        source: "scraped",
      }));
    }

    // ---------- Merge and restore order ----------
    const manualMap = new Map(hydratedManual.map((d) => [String(d._id), d]));
    const scrapedMap = new Map(hydratedScraped.map((d) => [String(d._id), d]));
    const finalPage = pageSliceLight
      .map((it) =>
        it.source === "manual"
          ? manualMap.get(String(it._id))
          : scrapedMap.get(String(it._id))
      )
      .filter(Boolean);

    // ---------- Add Disclaimer to each supplement (only if isActive: true) ----------
    const finalPageWithDisclaimer = finalPage.map((supplement) => ({
      ...supplement,
      disclaimer:
        supplementDisclaimer && supplementDisclaimer.isActive === true
          ? {
              id: supplementDisclaimer._id,
              type: supplementDisclaimer.type,
              title: supplementDisclaimer.title,
              content: supplementDisclaimer.content,
              isActive: supplementDisclaimer.isActive,
            }
          : null,
    }));

    // ---------- Totals ----------
    const totalManual = await SupplementModel.countDocuments(manualMatch);
    let scrapedCountMatch = { ...scrapedMatch };
    if (scrapedIngOr)
      scrapedCountMatch = { ...scrapedCountMatch, $or: scrapedIngOr };
    const totalScraped = await SupplementDetails.countDocuments(
      scrapedCountMatch
    );
    const totalItems = totalManual + totalScraped;

    // ---------- Activity log ----------
    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.GET_ALL_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: activityDescriptions.SUPPLEMENT.FETCH_ALL_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    // Debug logging for results
    console.log("📊 Supplement List API - Results:", {
      totalManual,
      totalScraped,
      totalItems,
      finalPageCount: finalPage.length,
      page: Number(page),
      limit: parsedLimit,
      totalPages: Math.ceil(totalItems / parsedLimit),
    });

    // ---------- Response ----------
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Supplements fetched successfully.",
      pagination: {
        page: Number(page),
        limit: parsedLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / parsedLimit),
        hasNextPage: Number(page) < Math.ceil(totalItems / parsedLimit),
        hasPrevPage: Number(page) > 1,
      },
      data: finalPageWithDisclaimer,
    });
  } catch (error) {
    console.error("❌ Get All Supplements Error:", error);
    try {
      await activityLogService.createActivity({
        userId: req.user.id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.GET_ALL_SUPPLEMENT,
        activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
        description: error.message || "Failed to fetch all supplement.",
        status: enumConfig.activityStatusEnum.ERROR,
      });
    } catch (_) {}
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Server error.",
    });
  }
};

const getAllSupplementFilters = async (req, res) => {
  try {
    // simple 60s cache (no FE change)
    if (__filtersCache.payload && Date.now() - __filtersCache.at < CACHE_MS) {
      return apiResponse({
        res,
        status: true,
        statusCode: StatusCodes.OK,
        message: "Supplement filters fetched successfully.",
        data: __filtersCache.payload,
      });
    }

    // Tags (same)
    const tagsDocs = await SupplementTag.find({
      active: true,
      isDeleted: false,
    })
      .select("name -_id")
      .lean();
    const tags = uniqueCiSorted(
      toCleanList(tagsDocs.map((t) => properCapitalize(t.name)))
    );

    // Ingredients (same master)
    const ingDocs = await IngredientModel.find({}).select("name -_id").lean();
    const ingredients = uniqueCiSorted(
      toCleanList(ingDocs.map((i) => properCapitalize(i.name)))
    );

    // Usage groups: manual + scraped
    // manual: array<string> stored directly on docs
    const manualUsageRaw = await SupplementModel.distinct("usageGroup", {
      isAvailable: true,
    });
    // scraped: path is data.targetGroups (strings)
    let scrapedUsageRaw = [];
    try {
      scrapedUsageRaw = await SupplementDetails.distinct(
        "data.targetGroups",
        {}
      );
    } catch (_) {
      // if scraped collection missing in some envs, keep empty
      scrapedUsageRaw = [];
    }

    const usageGroups = uniqueCiSorted(
      toCleanList([...(manualUsageRaw || []), ...(scrapedUsageRaw || [])]).map(
        properCapitalize
      )
    );

    const payload = { tags, ingredients, usageGroups };

    // save to cache
    __filtersCache = { at: Date.now(), payload };

    // activity log (unchanged)
    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.SUPPLEMENT.GET_ALL_SUPPLEMENT_FILTERS,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: "Supplement filters fetched successfully.",
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Supplement filters fetched successfully.",
      data: payload, // 👈 same shape as before
    });
  } catch (error) {
    console.error("Get All Supplements Filters Error:", error);
    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType:
        enumConfig.activityTypeEnum.SUPPLEMENT.GET_ALL_SUPPLEMENT_FILTERS,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: error.message || "Failed to fetch all supplement filters.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Server error.",
    });
  }
};

// Bulk import supplements
const cleanString = (str) => (typeof str === "string" ? str.trim() : str);

const parseStringArray = (field) => {
  if (!field || typeof field !== "string") return [];
  return field
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s);
};

const resolveIngredientsByName = async (names = []) => {
  if (!Array.isArray(names) || names.length === 0) return [];
  const ingredients = await SupplementModel.find({
    name: { $in: names },
  }).select("_id name");
  return ingredients.map((i) => i._id);
};

const bulkImportSupplements = async (req, res) => {
  if (!req.file) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: "No file uploaded.",
    });
  }

  const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

  try {
    const fileBuffer = req.file.buffer;
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const supplements = XLSX.utils.sheet_to_json(sheet);

    // ✅ Blank sheet validation
    if (!supplements || supplements.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "No data found in uploaded file. Please add some records.",
      });
    }

    const seenInFile = new Set();
    const uniqueSupplements = [];
    const duplicateEntries = [];
    const invalidEntries = [];

    for (let item of supplements) {
      const key = `${item.productName?.trim().toLowerCase()}|${item.brandName
        ?.trim()
        .toLowerCase()}`;
      if (seenInFile.has(key)) {
        duplicateEntries.push({ ...item, reason: "Duplicate in file" });
        continue;
      }
      seenInFile.add(key);
      uniqueSupplements.push(item);
    }

    const queryOr = uniqueSupplements.map((item) => ({
      createdBy: req.user.id,
      productName: item.productName,
      brandName: item.brandName,
    }));

    const existingInDB = await SupplementModel.find({ $or: queryOr });

    const finalSupplementsToInsert = [];

    for (let item of uniqueSupplements) {
      const exists = existingInDB.find(
        (dbItem) =>
          dbItem.productName === item.productName &&
          dbItem.brandName === item.brandName &&
          dbItem.createdBy.toString() === req.user.id
      );

      if (exists) {
        duplicateEntries.push({ ...item, reason: "Already exists in DB" });
        continue;
      }

      // Optional: handle missing required fields
      if (!item.productName || !item.brandName) {
        invalidEntries.push({
          ...item,
          reason: "Missing productName or brandName",
        });
        continue;
      }

      // Parse comma-separated ingredients (e.g., "Iron,Vitamin C")
      const ingredientNames = parseStringArray(item.ingredients);
      const ingredientIds = await resolveIngredientsByName(ingredientNames);

      // Parse comma-separated tags (e.g., "Vitamin D,Omega-3")
      const tagNames = parseStringArray(item.tags);
      const tagIds = [];
      if (tagNames.length > 0) {
        const tagDocs = await SupplementTag.find({
          name: { $in: tagNames },
          active: true,
          isDeleted: false,
        });
        tagIds.push(...tagDocs.map((tag) => tag._id));
      }

      finalSupplementsToInsert.push({
        createdBy: req.user.id,
        productName: cleanString(item.productName),
        brandName: cleanString(item.brandName),
        servingsPerContainer: cleanString(item.servingsPerContainer) || "",
        servingSize: cleanString(item.servingSize) || "",
        description: cleanString(item.description) || "",
        usageGroup: parseStringArray(item.usageGroup),
        warnings: parseStringArray(item.warnings),
        claims: parseStringArray(item.claims),
        ingredients: ingredientIds,
        tags: tagIds,
        createdByAdmin: isAdmin,
      });
    }

    if (finalSupplementsToInsert.length > 0) {
      await SupplementModel.insertMany(finalSupplementsToInsert);
    }

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.BULK_IMPORT_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: activityDescriptions.SUPPLEMENT.BULK_IMPORT_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: `${finalSupplementsToInsert.length} supplements imported. ${duplicateEntries.length} duplicates skipped. ${invalidEntries.length} invalid entries skipped.`,
      body: {
        imported: finalSupplementsToInsert.length,
        duplicates: duplicateEntries,
        invalids: invalidEntries,
      },
    });
  } catch (error) {
    console.error("Bulk Import Error:", error);

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.BULK_IMPORT_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: error.message || "Failed to fetch bulk import supplement.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to import supplements.",
    });
  }
};

// Bulk delete supplements
const bulkDeleteSupplements = async (req, res) => {
  try {
    const { ids } = req.body;

    // Step 1: Validate Input
    if (!ids) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "IDs array is required.",
      });
    }

    if (!Array.isArray(ids) && ids.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "IDs array is required and should not be empty.",
      });
    }

    // Step 2: Separate valid and invalid ObjectIds
    const validIds = [];
    const invalidIds = [];

    ids.forEach((id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        validIds.push(id);
      } else {
        invalidIds.push(id);
      }
    });

    // Step 3: Find existing supplements (only with valid IDs)
    let foundSupplements = [];
    if (validIds.length > 0) {
      foundSupplements = await SupplementModel.find({ _id: { $in: validIds } });
    }

    const foundIds = foundSupplements.map((s) => s._id.toString());
    const idsNotFound = validIds.filter((id) => !foundIds.includes(id));

    // Step 4: Filter admin-created supplements for deletion
    const deletableSupplements = foundSupplements.filter(
      (s) => s.createdByAdmin === true
    );
    const deletableIds = deletableSupplements.map((s) => s._id.toString());

    const notDeletableIds = foundSupplements
      .filter((s) => s.createdByAdmin !== true)
      .map((s) => s._id.toString());

    // Step 5: Delete only admin-created supplements
    let deletedCount = 0;
    if (deletableIds.length > 0) {
      const deleteResult = await SupplementModel.deleteMany({
        _id: { $in: deletableIds },
      });
      deletedCount = deleteResult.deletedCount;
    }

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.BULK_DELETE_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: activityDescriptions.SUPPLEMENT.BULK_DELETE_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    // Step 6: Return detailed response
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message:
        `${deletedCount} supplement(s) deleted successfully. ` +
        `${
          invalidIds.length > 0 ? invalidIds.length + " invalid ID(s). " : ""
        }` +
        `${
          idsNotFound.length > 0
            ? idsNotFound.length + " ID(s) not found. "
            : ""
        }` +
        `${
          notDeletableIds.length > 0
            ? notDeletableIds.length +
              " supplement(s) not created by admin and skipped."
            : ""
        }`,
      body: {
        deletedCount,
        deletedIds: deletableIds,
        idsNotFound,
        notDeletableIds,
        invalidIds,
      },
    });
  } catch (error) {
    console.error("Bulk Delete Error:", error);

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.BULK_DELETE_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: error.message || "Failed to bulk delete supplement.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to delete supplements.",
      error: error.message,
    });
  }
};

// Import supplements from JSON file or raw data
const cleanStr = (val) =>
  typeof val === "string" && val.trim() !== "" ? val.trim() : "";

const parseArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(cleanStr).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => cleanStr(v))
      .filter(Boolean);
  }
  return [];
};

const importSupplementFromJSON = async (req, res) => {
  try {
    let supplements = [];

    if (req.file) {
      const ext = path.extname(req.file.originalname);
      if (ext !== ".json") {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Only JSON file is allowed.",
        });
      }

      const data = fs.readFileSync(req.file.path, "utf8");
      supplements = JSON.parse(data);
      fs.unlinkSync(req.file.path);
    } else if (Array.isArray(req.body)) {
      supplements = req.body;
    } else if (req.body.data) {
      supplements = JSON.parse(req.body.data);
    }

    if (!Array.isArray(supplements) || supplements.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Uploaded JSON must be a non-empty array.",
        data: null,
      });
    }

    const userId = req.user?._id;
    const isAdmin =
      Array.isArray(req.user?.role) && req.user.role.includes("admin");

    const seenInFile = new Set();
    const duplicates = [];
    const filtered = [];

    for (const item of supplements) {
      const productName = cleanStr(item.productName);
      const brandName = cleanStr(item.brandName);

      if (!productName) continue;

      const key = `${productName.toLowerCase()}|${(
        brandName || ""
      ).toLowerCase()}`;

      if (seenInFile.has(key)) {
        duplicates.push({ ...item, reason: "Duplicate in uploaded file" });
        continue;
      }

      seenInFile.add(key);
      filtered.push({ ...item, productName, brandName });
    }

    // Check existing records in DB
    const uniqueKeys = Array.from(seenInFile);
    const productConditions = uniqueKeys.map((key) => {
      const [productName, brandName] = key.split("|");
      return {
        productName: new RegExp(`^${productName}$`, "i"),
        brandName: new RegExp(`^${brandName}$`, "i"),
        createdBy: userId,
      };
    });

    const existingSupplements = await SupplementModel.find({
      $or: productConditions,
    }).lean();

    const existingKeys = new Set(
      existingSupplements.map(
        (doc) =>
          `${doc.productName.toLowerCase()}|${(
            doc.brandName || ""
          ).toLowerCase()}`
      )
    );

    const toInsert = [];

    for (const item of filtered) {
      const key = `${item.productName.toLowerCase()}|${(
        item.brandName || ""
      ).toLowerCase()}`;
      if (existingKeys.has(key)) {
        duplicates.push({ ...item, reason: "Already exists in DB" });
        continue;
      }

      // Validate ingredient IDs
      const rawIngredients = Array.isArray(item.ingredients)
        ? item.ingredients
        : [];
      const validIngredientIds = rawIngredients
        .map((id) => {
          try {
            return typeof id === "string" || typeof id === "object"
              ? mongoose.Types.ObjectId(id)
              : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Fetch existing Ingredient IDs from DB
      const existingIngredientDocs = await IngredientModel.find({
        _id: { $in: validIngredientIds },
      }).select("_id");

      const existingIngredientIds = new Set(
        existingIngredientDocs.map((doc) => doc._id.toString())
      );

      const missingIngredients = validIngredientIds.filter(
        (id) => !existingIngredientIds.has(id.toString())
      );

      if (missingIngredients.length > 0) {
        duplicates.push({
          ...item,
          reason: `Invalid or missing ingredient IDs: ${missingIngredients.join(
            ", "
          )}`,
        });
        continue;
      }

      // Validate tag IDs
      const rawTags = Array.isArray(item.tags) ? item.tags : [];
      const validTagIds = rawTags
        .map((id) => {
          try {
            return typeof id === "string" || typeof id === "object"
              ? mongoose.Types.ObjectId(id)
              : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Fetch existing Tag IDs from DB
      const existingTagDocs = await SupplementTag.find({
        _id: { $in: validTagIds },
        active: true,
        isDeleted: false,
      }).select("_id");

      const existingTagIds = new Set(
        existingTagDocs.map((doc) => doc._id.toString())
      );

      const missingTags = validTagIds.filter(
        (id) => !existingTagIds.has(id.toString())
      );

      if (missingTags.length > 0) {
        duplicates.push({
          ...item,
          reason: `Invalid or missing tag IDs: ${missingTags.join(", ")}`,
        });
        continue;
      }

      toInsert.push({
        createdBy: userId,
        productName: item.productName,
        brandName: item.brandName,
        servingsPerContainer: cleanStr(item.servingsPerContainer),
        servingSize: cleanStr(item.servingSize),
        ingredients: validIngredientIds,
        tags: validTagIds,
        usageGroup: parseArray(item.usageGroup),
        description: cleanStr(item.description),
        warnings: parseArray(item.warnings),
        claims: parseArray(item.claims),
        createdByAdmin: isAdmin,
      });
    }

    if (toInsert.length > 0) {
      await SupplementModel.insertMany(toInsert);
    }

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.JSON_IMPORT_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: activityDescriptions.SUPPLEMENT.JSON_IMPORT_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: `${toInsert.length} supplements imported. ${duplicates.length} duplicates skipped.`,
      body: {
        inserted: toInsert.length,
        duplicates,
      },
    });
  } catch (error) {
    console.error("Import Supplement from JSON Error:", error);

    await activityLogService.createActivity({
      userId: req.user.id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.JSON_IMPORT_SUPPLEMENT,
      activityCategory: enumConfig.activityCategoryEnum.SUPPLEMENT,
      description: error.message || "Failed to import supplements from JSON.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to import supplements from JSON.",
      data: null,
    });
  }
};

const getSupplementTemplate = async (req, res) => {
  try {
    const columns = [
      "productName",
      "brandName",
      "description",
      "servingsPerContainer",
      "servingSize",
      "usageGroup",
      "warnings",
      "claims",
      "tags",
    ];

    // ✅ Sample rows (10 entries)
    const sampleData = [
      [
        "Vitamin C Tablets",
        "HealthPlus",
        "Boosts immunity",
        "60",
        "1 Tablet",
        "Adults",
        "Overdose may cause nausea",
        "Supports immune health",
        "Vitamin C,Immunity",
      ],
      [
        "Omega 3 Fish Oil",
        "NutriLife",
        "Supports heart health",
        "90",
        "2 Capsules",
        "Adults",
        "Consult doctor if on blood thinners",
        "Promotes cardiovascular health",
        "Omega-3,Heart",
      ],
      [
        "Protein Powder",
        "MuscleMax",
        "Whey protein supplement",
        "30",
        "1 Scoop",
        "Athletes,Adults",
        "Not for lactose intolerant",
        "Muscle recovery and growth",
        "Protein,Fitness",
      ],
      [
        "Calcium Tablets",
        "BoneStrong",
        "Supports bone strength",
        "100",
        "1 Tablet",
        "Adults,Elderly",
        "Overuse may cause constipation",
        "Strengthens bones",
        "Calcium,Bones",
      ],
      [
        "Multivitamin Gummies",
        "VitaChew",
        "Daily essential vitamins",
        "60",
        "2 Gummies",
        "Kids,Adults",
        "Do not exceed daily dose",
        "Overall wellness",
        "Multivitamin,Wellness",
      ],
      [
        "Iron Capsules",
        "FerroBoost",
        "Helps in iron deficiency",
        "30",
        "1 Capsule",
        "Women,Pregnant",
        "Avoid overdose",
        "Improves hemoglobin levels",
        "Iron,Women Health",
      ],
      [
        "Zinc Tablets",
        "ImmunoZinc",
        "Supports immunity and skin",
        "50",
        "1 Tablet",
        "Adults",
        "Do not take with antibiotics",
        "Boosts immunity",
        "Zinc,Immunity",
      ],
      [
        "Vitamin D Drops",
        "SunDrop",
        "Supports bone and immunity",
        "20",
        "5 Drops",
        "Kids,Adults",
        "Avoid overdose",
        "Supports calcium absorption",
        "Vitamin D,Bones",
      ],
      [
        "Herbal Green Tea",
        "NatureCare",
        "Antioxidant-rich herbal tea",
        "40",
        "1 Tea Bag",
        "Adults",
        "Limit to 2 cups daily",
        "Detox and metabolism boost",
        "Herbal,Detox",
      ],
      [
        "Probiotic Capsules",
        "GutHealth",
        "Supports digestion and gut health",
        "60",
        "1 Capsule",
        "Adults",
        "Store in cool place",
        "Improves gut flora",
        "Probiotic,Digestive",
      ],
    ];

    // CSV Template with sample data
    const csvContent = [
      columns.join(","),
      ...sampleData.map((row) => row.join(",")),
    ].join("\n");
    const csvBuffer = Buffer.from(csvContent);

    const csvUpload = await fileUploadService.uploadFile({
      buffer: csvBuffer,
      mimetype: "text/csv",
      key: "templates/supplements_template_sample.csv",
    });

    // XLS Template with sample data
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([columns, ...sampleData]);
    XLSX.utils.book_append_sheet(wb, ws, "Supplements");
    const xlsBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    const xlsUpload = await fileUploadService.uploadFile({
      buffer: xlsBuffer,
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      key: "templates/supplements_template_sample.xlsx",
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Supplement sample template ready",
      data: {
        csv: csvUpload,
        xlsx: xlsUpload,
      },
    });
  } catch (error) {
    console.error("Supplement Template Error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to generate supplement template.",
    });
  }
};

export default {
  createSupplement,
  updateSupplement,
  deleteSupplement,
  getSingleSupplement,
  getAllSupplements,
  bulkImportSupplements,
  bulkDeleteSupplements,
  importSupplementFromJSON,
  getAllSupplementFilters,
  getSupplementTemplate,
};
