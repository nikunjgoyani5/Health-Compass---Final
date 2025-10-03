import XLSX from "xlsx";
import { StatusCodes } from "http-status-codes";
import enumConfig from "../config/enum.config.js";
import { apiResponse } from "../helper/api-response.helper.js";
import IngredientModel from "../models/ingredient.model.js";
import IngredientDetails from "../models/ingredient-details-scraped.model.js";
import fs from "fs";
import User from "../models/user.model.js";
import path from "path";
import mongoose from "mongoose";
import activityDescriptions from "../config/activity-description.config.js";
import activityLogService from "../services/activity-log.service.js";
import SupplementModel from "../models/supplements.model.js";
import {
  normalizeScrapedIngredientBatch,
  buildScrapedIngredientMongoFilter,
  DEFAULT_SCRAPED_ING_CREATOR_ID,
} from "../utils/ingredientScraped.mapper.js";
import { v4 as uuidv4 } from "uuid";
import fileUploadService from "../services/file.upload.service.js";

const SCRAPED_ING_OWNER_ID = new mongoose.Types.ObjectId(
  process.env.SCRAPED_ING_CREATOR_ID || "68b56e114592c05548bb2354"
);

let _scrapedIngOwnerCache = null;
async function getScrapedIngredientOwnerLean() {
  if (_scrapedIngOwnerCache) return _scrapedIngOwnerCache;

  const u = await User.findById(SCRAPED_ING_OWNER_ID)
    .select("fullname email profileImage role")
    .lean();

  _scrapedIngOwnerCache = u
    ? { _id: u._id, email: u.email, profileImage: u.profileImage, role: u.role }
    : {
        _id: SCRAPED_ING_OWNER_ID,
        email: null,
        profileImage: null,
        role: ["admin"],
      };

  return _scrapedIngOwnerCache;
}

// ---- create ingredient ----
const createIngredient = async (req, res) => {
  try {
    const data = req.body;
    const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

    const isExisting = await IngredientModel.findOne({
      name: data.name,
      createdBy: req.user._id,
    });

    if (isExisting) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "This ingredient already exists.",
        data: null,
      });
    }

    const newIngredient = await IngredientModel.create({
      ...data,
      createdBy: req.user._id,
      createdByAdmin: isAdmin,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.ADD,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: activityDescriptions.INGREDIENT.ADD,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Ingredient created successfully.",
      data: newIngredient,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.ADD,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to create ingredient.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

// ---- get ingredients ----
const getallIngredients = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const userId = req.user._id;
    const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

    const parsedLimit = parseInt(limit);
    const skip = (parseInt(page) - 1) * parsedLimit;
    const regex = new RegExp(search, "i");

    const searchFilter = search
      ? {
          $or: [{ name: regex }, { description: regex }],
        }
      : {};

    let finalFilter;

    if (isAdmin) {
      // Admin: fetch only admin-created
      finalFilter = {
        createdByAdmin: true,
        ...searchFilter,
      };
    } else {
      finalFilter = {
        $or: [{ createdByAdmin: true }, { createdBy: userId }],
        ...searchFilter,
      };
    }

    const totalItems = await IngredientModel.countDocuments(finalFilter);
    const ingredients = await IngredientModel.find(finalFilter)
      .populate("createdBy", "fullName email profileImage")
      .sort({ createdByAdmin: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.GET_LIST,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: activityDescriptions.INGREDIENT.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Ingredients fetched successfully.",
      pagination: {
        page: Number(page),
        limit: parsedLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / parsedLimit),
      },
      data: ingredients,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.GET_LIST,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to fetch ingredient.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

/**Scrap data API */
// const getallIngredients = async (req, res) => {
//   try {
//     const { search = "", page = 1, limit = 10 } = req.query;

//     const userId = req.user._id || req.user.id;
//     const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

//     const parsedLimit = parseInt(limit, 10);
//     const parsedPage = parseInt(page, 10);
//     const skip = (parsedPage - 1) * parsedLimit;

//     const isSearching = typeof search === "string" && search.trim() !== "";
//     const regex = isSearching ? new RegExp(search.trim(), "i") : null;

//     // ---------- Manual match ----------
//     const manualMatch = isAdmin
//       ? { createdByAdmin: true }
//       : { $or: [{ createdByAdmin: true }, { createdBy: userId }] };

//     if (regex) {
//       manualMatch.$or = [
//         ...(manualMatch.$or || []),
//         { name: regex },
//         { description: regex },
//         { categories: regex },
//         { aliases: regex },
//       ];
//     }

//     // ---------- Scraped match ----------
//     const scrapedMatch = buildScrapedIngredientMongoFilter({ search });

//     // ---------- Projections ----------
//     const manualProject = {
//       _id: 1,
//       createdAt: 1,
//       updatedAt: 1,
//       createdByAdmin: 1,
//       createdBy: 1,
//       name: 1,
//       categories: 1,
//       aliases: 1,
//       description: 1,
//       nutrients: 1,
//       healthEffects: 1,
//       usage: 1,
//       foundInFoods: 1,
//       sideEffects: 1,
//       precautions: 1,
//       __v: 1,
//       source: { $literal: "manual" },
//     };

//     // Scraped: keep minimal; hydrate later
//     const scrapedProject = {
//       _id: 1,
//       createdAt: 1,
//       updatedAt: 1,
//       source: { $literal: "scraped" },
//     };

//     // ✅ Make sure this is the correct model
//     const SCRAPED_COLL = IngredientDetails.collection.collectionName;

//     const pipeline = [
//       { $match: manualMatch },
//       { $project: manualProject },
//       {
//         $unionWith: {
//           coll: SCRAPED_COLL,
//           pipeline: [{ $match: scrapedMatch }, { $project: scrapedProject }],
//         },
//       },
//       { $sort: { createdAt: -1, _id: -1 } },
//       { $skip: skip },
//       { $limit: parsedLimit },
//     ];

//     console.time("⏱ ING_list_union");
//     const pageSliceLight = await IngredientModel.aggregate(pipeline);
//     console.timeEnd("⏱ ING_list_union");

//     // ---------- Hydration ----------
//     const manualIds = [];
//     const scrapedIds = [];
//     for (const it of pageSliceLight) {
//       if (it.source === "manual") manualIds.push(it._id);
//       else scrapedIds.push(it._id);
//     }

//     // Manual hydrate + FE parity + createdBy
//     let hydratedManual = [];
//     if (manualIds.length) {
//       hydratedManual = await IngredientModel.find({ _id: { $in: manualIds } })
//         .populate("createdBy", "fullname email profileImage role")
//         .lean();

//       hydratedManual = hydratedManual.map((m) => ({
//         ...m,
//         categories: Array.isArray(m.categories) ? m.categories : [],
//         aliases: Array.isArray(m.aliases) ? m.aliases : [],
//         nutrients: Array.isArray(m.nutrients) ? m.nutrients : [],
//         healthEffects: Array.isArray(m.healthEffects) ? m.healthEffects : [],
//         foundInFoods: Array.isArray(m.foundInFoods) ? m.foundInFoods : [],
//         sideEffects: Array.isArray(m.sideEffects) ? m.sideEffects : [],
//         precautions: Array.isArray(m.precautions) ? m.precautions : [],
//         createdByAdmin: !!m.createdByAdmin,
//         __v: typeof m.__v === "number" ? m.__v : 0,
//         source: "manual",
//       }));
//     }

//     // Scraped hydrate + normalize + FE parity + owner object
//     let hydratedScraped = [];
//     if (scrapedIds.length) {
//       const rawScraped = await IngredientDetails.find(
//         { _id: { $in: scrapedIds } },
//         {
//           groupName: 1,
//           category: 1,
//           synonyms: 1,
//           factsheets: 1,
//           nutrientInfo: 1,
//           createdAt: 1,
//           updatedAt: 1,
//         }
//       ).lean();

//       console.time("⏱ ING_norm_batch");
//       hydratedScraped = await normalizeScrapedIngredientBatch(rawScraped);
//       console.timeEnd("⏱ ING_norm_batch");

//       const ownerObj = await getScrapedIngredientOwnerLean();

//       hydratedScraped = hydratedScraped.map((x) => ({
//         ...x,
//         categories: Array.isArray(x.categories) ? x.categories : [],
//         aliases: Array.isArray(x.aliases) ? x.aliases : [],
//         nutrients: Array.isArray(x.nutrients) ? x.nutrients : [],
//         healthEffects: Array.isArray(x.healthEffects) ? x.healthEffects : [],
//         foundInFoods: Array.isArray(x.foundInFoods) ? x.foundInFoods : [],
//         sideEffects: Array.isArray(x.sideEffects) ? x.sideEffects : [],
//         precautions: Array.isArray(x.precautions) ? x.precautions : [],
//         createdByAdmin: true,
//         __v: typeof x.__v === "number" ? x.__v : 0,
//         createdBy: ownerObj, // 👈 populated-like
//         source: "scraped",
//       }));
//     }

//     // ---------- Preserve union order ----------
//     const manualMap = new Map(hydratedManual.map((d) => [String(d._id), d]));
//     const scrapedMap = new Map(hydratedScraped.map((d) => [String(d._id), d]));

//     const finalPage = pageSliceLight
//       .map((it) =>
//         it.source === "manual"
//           ? manualMap.get(String(it._id))
//           : scrapedMap.get(String(it._id))
//       )
//       .filter(Boolean);

//     // ---------- Totals ----------
//     console.time("⏱ ING_totals");
//     const totalManual = await IngredientModel.countDocuments(manualMatch);
//     const totalScraped = await IngredientDetails.countDocuments(scrapedMatch);
//     const totalItems = totalManual + totalScraped;
//     console.timeEnd("⏱ ING_totals");

//     // Activity
//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.INGREDIENT.GET_LIST,
//       activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
//       description: activityDescriptions.INGREDIENT.GET,
//       status: enumConfig.activityStatusEnum.SUCCESS,
//     });

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Ingredients fetched successfully.",
//       pagination: {
//         page: Number(page),
//         limit: parsedLimit,
//         totalItems,
//         totalPages: Math.ceil(totalItems / parsedLimit),
//       },
//       data: finalPage,
//     });
//   } catch (error) {
//     console.error("Get All Ingredients Error:", error);
//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.INGREDIENT.GET_LIST,
//       activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
//       description: error.message || "Failed to fetch ingredient.",
//       status: enumConfig.activityStatusEnum.ERROR,
//     });
//     return apiResponse({
//       res,
//       status: false,
//       statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
//       message: "Internal server error.",
//       data: null,
//     });
//   }
// };

// ---- update ingredient ----

const updateIngredient = async (req, res) => {
  try {
    const ingredient = await IngredientModel.findById(req.params.id);
    if (!ingredient) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Ingredient not found.",
      });
    }

    // const isAdmin = req.user.role.includes("admin");
    // const isCreator =
    //   ingredient.createdBy.toString() === req.user.id.toString();

    // if (!isAdmin && !isCreator) {
    //   return apiResponse({
    //     res,
    //     status: false,
    //     statusCode: StatusCodes.FORBIDDEN,
    //     message: "You are not authorized to update this ingredient.",
    //   });
    // }

    const updated = await IngredientModel.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: activityDescriptions.INGREDIENT.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Ingredient updated successfully.",
      data: updated,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to update ingredient.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

// ---- delete ingredient ----
const deleteIngredient = async (req, res) => {
  try {
    const ingredient = await IngredientModel.findById(req.params.id);
    if (!ingredient) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Ingredient not found.",
        data: null,
      });
    }

    // const isAdmin = req.user.role?.includes(enumConfig.userRoleEnum.ADMIN);
    // let canDelete = false;

    // // Admin can delete only admin-created ingredient
    // if (ingredient.createdByAdmin && isAdmin) {
    //   canDelete = true;
    // }

    // // Users can delete only their own ingredient
    // else if (
    //   !ingredient.createdByAdmin &&
    //   ingredient.createdBy.toString() === req.user.id.toString()
    // ) {
    //   canDelete = true;
    // }

    // if (!canDelete) {
    //   return apiResponse({
    //     res,
    //     status: false,
    //     statusCode: StatusCodes.FORBIDDEN,
    //     message: "You are not authorized to delete this ingredient.",
    //     data: null,
    //   });
    // }

    // Pull the ingredient from all supplements
    await SupplementModel.updateMany(
      { ingredients: ingredient._id },
      { $pull: { ingredients: ingredient._id } }
    );

    // Delete the ingredient itself
    await IngredientModel.findByIdAndDelete(req.params.id);

    // Log activity
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: activityDescriptions.INGREDIENT.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Ingredient deleted successfully.",
      data: null,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to delete ingredient.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

// ---- get a ingredient by ID ----
const getIngredientsById = async (req, res) => {
  try {
    const { id } = req.params;

    const ingredient = await IngredientModel.findOne({
      _id: id,
    }).populate("createdBy", "fullName email profileImage");

    if (!ingredient) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Ingredient not found.",
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: activityDescriptions.INGREDIENT.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Ingredient fetched successfully.",
      data: ingredient,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to delete ingredient.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      stauts: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
    });
  }
};

/**Scrap data API */
// const getIngredientsById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const isObjId = mongoose.Types.ObjectId.isValid(id);

//     // 1) Try MANUAL first
//     let ing = null;
//     if (isObjId) {
//       ing = await IngredientModel.findById(id)
//         .populate("createdBy", "fullname email profileImage role")
//         .lean();

//       if (ing) {
//         ing = {
//           ...ing,
//           categories: Array.isArray(ing.categories) ? ing.categories : [],
//           aliases: Array.isArray(ing.aliases) ? ing.aliases : [],
//           nutrients: Array.isArray(ing.nutrients) ? ing.nutrients : [],
//           healthEffects: Array.isArray(ing.healthEffects)
//             ? ing.healthEffects
//             : [],
//           foundInFoods: Array.isArray(ing.foundInFoods) ? ing.foundInFoods : [],
//           sideEffects: Array.isArray(ing.sideEffects) ? ing.sideEffects : [],
//           precautions: Array.isArray(ing.precautions) ? ing.precautions : [],
//           createdByAdmin: !!ing.createdByAdmin,
//           __v: typeof ing.__v === "number" ? ing.__v : 0,
//           source: "manual",
//         };
//       }
//     }

//     // 2) SCRAPED fallback
//     if (!ing) {
//       const or = [];
//       if (isObjId) or.push({ _id: id });

//       // 👇 Better numeric groupId match inside hits array
//       if (/^\d+$/.test(id)) {
//         or.push({ hits: { $elemMatch: { "_source.groupId": id } } });
//       }

//       const scraped = await IngredientDetails.findOne(
//         or.length ? { $or: or } : { _id: null },
//         {
//           groupName: 1,
//           category: 1,
//           synonyms: 1,
//           factsheets: 1,
//           nutrientInfo: 1,
//           createdAt: 1,
//           updatedAt: 1,
//         }
//       ).lean();

//       if (!scraped) {
//         return apiResponse({
//           res,
//           status: false,
//           statusCode: StatusCodes.NOT_FOUND,
//           message: "Ingredient not found.",
//         });
//       }

//       const [norm] = await normalizeScrapedIngredientBatch([scraped]);
//       const ownerObj = await getScrapedIngredientOwnerLean();

//       ing = {
//         ...norm,
//         categories: Array.isArray(norm.categories) ? norm.categories : [],
//         aliases: Array.isArray(norm.aliases) ? norm.aliases : [],
//         nutrients: Array.isArray(norm.nutrients) ? norm.nutrients : [],
//         healthEffects: Array.isArray(norm.healthEffects)
//           ? norm.healthEffects
//           : [],
//         foundInFoods: Array.isArray(norm.foundInFoods) ? norm.foundInFoods : [],
//         sideEffects: Array.isArray(norm.sideEffects) ? norm.sideEffects : [],
//         precautions: Array.isArray(norm.precautions) ? norm.precautions : [],
//         createdBy: ownerObj, // ✅ populated-like
//         createdByAdmin: true,
//         __v: typeof norm.__v === "number" ? norm.__v : 0,
//         source: "scraped",
//       };

//       // hard defaults
//       if (!("_id" in ing)) ing._id = scraped._id;
//       if (!("name" in ing) || !ing.name)
//         ing.name = scraped.groupName || "Unknown Ingredient";
//       if (!("description" in ing)) ing.description = null;
//       if (!("usage" in ing)) ing.usage = null;
//     }

//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.INGREDIENT.GET,
//       activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
//       description: activityDescriptions.INGREDIENT.GET,
//       status: enumConfig.activityStatusEnum.SUCCESS,
//     });

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Ingredient fetched successfully.",
//       data: ing,
//     });
//   } catch (error) {
//     console.error("Get Ingredient By Id Error:", error);
//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.INGREDIENT.GET,
//       activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
//       description: error.message || "Failed to fetch ingredient.",
//       status: enumConfig.activityStatusEnum.ERROR,
//     });
//     return apiResponse({
//       res,
//       status: false,
//       statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
//       message: "Internal server error.",
//     });
//   }
// };

// ---- bulk import ingredients ----

const cleanString = (str) =>
  typeof str === "string" && str.trim() !== "" ? str.trim() : null;

const parseStringArray = (field) => {
  if (!field || typeof field !== "string") return [];
  return field
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s);
};

const parseNutrients = (field) => {
  if (!field || typeof field !== "string") return [];

  try {
    // Format: "name:amount:percent | name2:amount2:percent2"
    return field.split("|").map((entry) => {
      const [name, amount, percent] = entry.split(":").map((s) => s.trim());
      return {
        name: name || null,
        amount: amount || null,
        dailyValuePercent: percent ? Number(percent) : null,
      };
    });
  } catch {
    return [];
  }
};

const parseHealthEffects = (field) => {
  if (!field || typeof field !== "string") return [];

  try {
    // Format: "desc:type | desc:type"
    return field.split("|").map((entry) => {
      const [description, type] = entry.split(":").map((s) => s.trim());
      return {
        description: description || null,
        type: ["positive", "negative", "neutral"].includes(type)
          ? type
          : "neutral",
      };
    });
  } catch {
    return [];
  }
};

const bulkImportIngredients = async (req, res) => {
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
    const ingredients = XLSX.utils.sheet_to_json(sheet);

    // ✅ Blank sheet validation
    if (!ingredients || ingredients.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "No data found in uploaded file. Please add some records.",
      });
    }

    const seenInFile = new Set();
    const uniqueIngredients = [];
    const duplicateEntries = [];

    // Step 1: In-file duplication check
    for (let item of ingredients) {
      const key = item.name?.toLowerCase().trim();
      if (!key || seenInFile.has(key)) {
        duplicateEntries.push({
          ...item,
          reason: "Duplicate in file or missing name",
        });
        continue;
      }
      seenInFile.add(key);
      uniqueIngredients.push(item);
    }

    // Step 2: DB-level duplication check
    const existing = await IngredientModel.find({
      name: { $in: uniqueIngredients.map((i) => i.name) },
      createdBy: req.user._id,
    });

    const finalIngredientsToInsert = [];

    for (let item of uniqueIngredients) {
      const alreadyInDB = existing.find(
        (ing) => ing.name.toLowerCase() === item.name.toLowerCase()
      );

      if (alreadyInDB) {
        duplicateEntries.push({ ...item, reason: "Already exists in DB" });
        continue;
      }

      finalIngredientsToInsert.push({
        createdBy: req.user.id,
        name: cleanString(item.name),
        categories: parseStringArray(item.categories),
        aliases: parseStringArray(item.aliases),
        description: cleanString(item.description),
        nutrients: parseNutrients(item.nutrients),
        healthEffects: parseHealthEffects(item.healthEffects),
        usage: cleanString(item.usage),
        foundInFoods: parseStringArray(item.foundInFoods),
        sideEffects: parseStringArray(item.sideEffects),
        precautions: parseStringArray(item.precautions),
        createdByAdmin: isAdmin,
      });
    }

    if (finalIngredientsToInsert.length > 0) {
      await IngredientModel.insertMany(finalIngredientsToInsert);
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.BULK_IMPORT,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: `${finalIngredientsToInsert.length} ingredients imported. ${duplicateEntries.length} duplicates skipped.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: `${finalIngredientsToInsert.length} ingredients imported. ${duplicateEntries.length} duplicates skipped.`,
      body: {
        imported: finalIngredientsToInsert.length,
        duplicates: duplicateEntries,
      },
    });
  } catch (error) {
    console.error("Bulk Import Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.BULK_IMPORT,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to bulk import ingredient.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to import ingredients.",
    });
  }
};

const getIngredientTemplate = async (req, res) => {
  try {
    // 1. Demo headers + example row
    const headers = [
      "name",
      "categories",
      "aliases",
      "description",
      "nutrients",
      "healthEffects",
      "usage",
      "foundInFoods",
      "sideEffects",
      "precautions",
    ];

    const exampleRow = {
      name: "Turmeric",
      categories: "Spice,Herb",
      aliases: "Haldi,Curcuma longa",
      description:
        "A bright yellow spice used in cooking and traditional medicine.",
      nutrients: JSON.stringify({ curcumin: "3g/100g", protein: "9.7g/100g" }),
      healthEffects: "Anti-inflammatory;Antioxidant",
      usage: "Use 1 tsp in curries, teas.",
      foundInFoods: "Curry powders,Mustard blends",
      sideEffects: "May cause stomach upset",
      precautions: "Pregnancy;Blood-thinning medication",
    };

    // 2. Create CSV buffer
    const csvHeaders = headers.join(",");
    const csvRow = headers
      .map((h) => `"${(exampleRow[h] || "").replace(/"/g, '""')}"`)
      .join(",");
    const csvContent = `${csvHeaders}\n${csvRow}\n`;
    const csvBuffer = Buffer.from(csvContent, "utf8");

    // 3. Create XLSX buffer
    const worksheet = XLSX.utils.json_to_sheet([exampleRow], {
      header: headers,
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    const xlsxBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    // 4. Upload with fixed keys (overwrite each time)
    const csvUpload = await fileUploadService.uploadFile({
      buffer: csvBuffer,
      mimetype: "text/csv",
      key: "templates/ingredient-template.csv",
    });

    console.log({ csvUpload });

    const xlsxUpload = await fileUploadService.uploadFile({
      buffer: xlsxBuffer,
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      key: "templates/ingredient-template.xlsx",
    });

    console.log({ xlsxUpload });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Ingredient template URLs",
      body: {
        csv: csvUpload,
        xlsx: xlsxUpload,
      },
    });
  } catch (error) {
    console.error("Template error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to generate template",
    });
  }
};

// ---- bulk delete ingredient ----
const bulkDeleteIngredient = async (req, res) => {
  try {
    const { ids } = req.body;
    // Step 1: Validate Input
    if (!Array.isArray(ids) || ids.length === 0) {
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

    // Step 3: Find existing Ingredients
    let foundIngredient = [];
    if (validIds.length > 0) {
      foundIngredient = await IngredientModel.find({ _id: { $in: validIds } });
    }

    const foundIds = foundIngredient.map((s) => s._id.toString());
    const idsNotFound = validIds.filter((id) => !foundIds.includes(id));

    // Step 4: Filter admin-created ingredients
    const deletableIngredient = foundIngredient.filter(
      (s) => s.createdByAdmin === true
    );
    const deletableIds = deletableIngredient.map((s) => s._id.toString());

    const notDeletableIds = foundIngredient
      .filter((s) => s.createdByAdmin !== true)
      .map((s) => s._id.toString());

    // Step 5: Remove ingredient references from supplements
    if (deletableIds.length > 0) {
      await SupplementModel.updateMany(
        { ingredients: { $in: deletableIds } },
        { $pull: { ingredients: { $in: deletableIds } } }
      );

      // Step 6: Delete the ingredients themselves
      const deleteResult = await IngredientModel.deleteMany({
        _id: { $in: deletableIds },
      });

      deletedCount = deleteResult.deletedCount;
    }

    // Step 7: Log activity
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.BULK_DELETE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description:
        `${deletableIds.length} Ingredient(s) deleted successfully. ` +
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
            ? notDeletableIds.length + " not deletable (non-admin)."
            : ""
        }`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    // Step 8: Response
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message:
        `${deletableIds.length} Ingredient(s) deleted successfully. ` +
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
            ? notDeletableIds.length + " not deletable (non-admin)."
            : ""
        }`,
      body: {
        deletedCount: deletableIds.length,
        deletedIds: deletableIds,
        idsNotFound,
        notDeletableIds,
        invalidIds,
      },
    });
  } catch (error) {
    console.error("Bulk Delete Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.BULK_DELETE,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to bulk delete ingredients.",
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

// ---- Import Ingredient from JSON ----
const trimIfString = (val) => (typeof val === "string" ? val.trim() : "");

const importIngredientFromJSON = async (req, res) => {
  try {
    let ingredients = [];

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
      if (!data) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Uploaded JSON file is empty.",
        });
      }
      ingredients = JSON.parse(data);
      fs.unlinkSync(req.file.path);
    } else if (Array.isArray(req.body)) {
      ingredients = req.body;
    } else if (req.body.data) {
      ingredients = JSON.parse(req.body.data);
    }

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message: "Uploaded JSON must be a non-empty array.",
      });
    }

    const userId = req.user?._id;
    const isAdmin =
      Array.isArray(req.user?.role) && req.user.role.includes("admin");

    const newIngredients = [];
    const skippedIngredients = [];

    for (const item of ingredients) {
      const name = trimIfString(item.name);
      if (!name) continue;

      const exists = await IngredientModel.findOne({
        name: name,
        createdBy: userId,
      });

      if (exists) {
        skippedIngredients.push(name);
        continue;
      }

      newIngredients.push({
        createdBy: userId,
        name,
        categories: Array.isArray(item.categories)
          ? item.categories.map(trimIfString)
          : [],
        aliases: Array.isArray(item.aliases)
          ? item.aliases.map(trimIfString)
          : [],
        description: trimIfString(item.description),
        usage: trimIfString(item.usage),
        foundInFoods: Array.isArray(item.foundInFoods)
          ? item.foundInFoods.map(trimIfString)
          : [],
        sideEffects: Array.isArray(item.sideEffects)
          ? item.sideEffects.map(trimIfString)
          : [],
        precautions: Array.isArray(item.precautions)
          ? item.precautions.map(trimIfString)
          : [],
        createdByAdmin: isAdmin,
        nutrients: Array.isArray(item.nutrients)
          ? item.nutrients.map((n) => ({
              name: trimIfString(n.name),
              amount: trimIfString(n.amount),
              dailyValuePercent: Number(n.dailyValuePercent) || undefined,
            }))
          : [],
        healthEffects: Array.isArray(item.healthEffects)
          ? item.healthEffects.map((h) => ({
              description: trimIfString(h.description),
              type: ["positive", "negative", "neutral"].includes(h.type)
                ? h.type
                : "neutral",
            }))
          : [],
      });
    }

    let result = [];
    if (newIngredients.length > 0) {
      result = await IngredientModel.insertMany(newIngredients);
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.IMPORT_JSON,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: `${result.length} ingredients imported. ${skippedIngredients.length} skipped due to duplicates.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: `${result.length} ingredients imported. ${skippedIngredients.length} skipped due to duplicates.`,
      data: {
        importedCount: result.length,
        skippedCount: skippedIngredients.length,
        skippedNames: skippedIngredients,
        insertedData: result,
      },
    });
  } catch (error) {
    console.error("Import Ingredient JSON Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.INGREDIENT.ADD,
      activityCategory: enumConfig.activityCategoryEnum.INGREDIENT,
      description: error.message || "Failed to create ingredient.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to import ingredients from JSON.",
      data: null,
    });
  }
};

export default {
  createIngredient,
  getallIngredients,
  updateIngredient,
  deleteIngredient,
  getIngredientsById,
  bulkImportIngredients,
  bulkDeleteIngredient,
  importIngredientFromJSON,
  getIngredientTemplate,
};
