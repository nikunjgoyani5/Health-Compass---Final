import { apiResponse } from "../helper/api-response.helper.js";
import { StatusCodes } from "http-status-codes";
import Medicine from "../models/medicine.model.js";
import XLSX from "xlsx";
import { verifyMedicineDetailsWithOpenAI } from "../utils/gpt.utils.js";
import enumConfig from "../config/enum.config.js";
import mongoose from "mongoose";
import commonHelper from "../helper/common.helper.js";
import fs from "fs";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";
import MedicineSchedule from "../models/medicine.schedual.model.js";
import Onboarding from "../models/onboarding.model.js";
import Disclaimer from "../models/disclaimer.model.js";
import {
  normalizeScrapedMedicineBatch,
  buildScrapedMedicineMongoFilter,
} from "../utils/medicineScraped.mapper.js";
import DrugsDetails from "../models/medicineDetails-scraped.model.js";
import fileUploadService from "../services/file.upload.service.js";

const SCRAPED_MED_OWNER_ID =
  process.env.SCRAPED_MED_CREATOR_ID ?? "68b56e114592c05548bb2354";

const createMedicine = async (req, res) => {
  try {
    const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

    const {
      medicineName,
      dosage,
      description,
      takenForSymptoms,
      associatedRisks,
      price,
      quantity,
      singlePack,
      mfgDate,
      expDate,

      // Optional Phase-2 fields
      brandName,
      manufacturer,
      usage,
      route,
      sideEffects,
      warnings,
      contraindications,
      storageInstructions,
      pregnancySafe,
      pediatricUse,
      adverseReactions,
      rxRequired,

      // Overlay Notes (only allowed for Admins)
      spiritualOverlayNotes,
    } = req.body;

    // 1. Check if already exists for the user
    const existing = await Medicine.findOne({
      medicineName,
      dosage,
      userId: req.user.id,
    });

    if (existing) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "This medicine already exists.",
        data: null,
      });
    }

    // Optional: OpenAI Verification (if needed)
    // const verification = await verifyMedicineDetailsWithOpenAI({
    //   medicineName,
    //   dosage,
    //   description,
    //   takenForSymptoms,
    //   associatedRisks,

    //   // Optional Phase-2 fields
    //   usage,
    //   sideEffects,
    //   warnings,
    //   contraindications,
    //   storageInstructions,
    //   pregnancySafe,
    //   pediatricUse,
    //   adverseReactions,
    // });
    //
    // if (!verification.isValid) {
    //   return apiResponse({
    //     res,
    //     status: false,
    //     statusCode: StatusCodes.BAD_REQUEST,
    //     message: verification.message,
    //     data: null,
    //   });
    // }

    // 2. Build medicine object

    const medicineData = {
      userId: req.user.id,
      medicineName,
      dosage,
      description,
      takenForSymptoms,
      associatedRisks,
      price,
      quantity,
      singlePack,
      mfgDate,
      expDate,
      createdByAdmin: isAdmin,

      // Optional fields
      brandName,
      manufacturer,
      usage,
      route,
      sideEffects,
      warnings,
      contraindications,
      storageInstructions,
      pregnancySafe,
      pediatricUse,
      adverseReactions,
      rxRequired,
    };

    // 3. Handle spiritualOverlayNotes (Admins only)
    if (
      isAdmin &&
      Array.isArray(spiritualOverlayNotes) &&
      spiritualOverlayNotes.length > 0
    ) {
      // 🔍 Check duplicate modes
      const modes = spiritualOverlayNotes.map((n) => n.mode);
      const uniqueModes = new Set(modes);

      if (modes.length !== uniqueModes.size) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message:
            "Duplicate modes are not allowed in spiritual overlay notes.",
          data: null,
        });
      }

      medicineData.spiritualOverlayNotes = spiritualOverlayNotes;
    }

    // If user is not admin but tried to send overlay notes
    if (!isAdmin && spiritualOverlayNotes.length > 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "Only admins can add spiritual overlay notes.",
        data: null,
      });
    }

    // 4. Save
    const newMedicine = new Medicine(medicineData);
    await newMedicine.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.ADD,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: activityDescriptions.MEDICINE.ADD,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: "Medicine added successfully.",
      data: newMedicine,
    });
  } catch (error) {
    console.error("Create Medicine Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.ADD,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to add medicine.",
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

const updateMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Medicine not found.",
      });
    }

    const isAdmin = req.user.role.includes("admin");
    const isCreator = medicine.userId.toString() === req.user.id.toString();

    if (!isAdmin && !isCreator) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You are not authorized to update this medicine.",
      });
    }

    // 🔍 Duplicate Check
    const existingMedicine = await Medicine.findOne({
      _id: { $ne: req.params.id },
      medicineName: req.body.medicineName,
      dosage: req.body.dosage,
      userId: req.user.id,
    });

    if (existingMedicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "This medicine already exists.",
      });
    }

    // --- Optional: OpenAI Verification Block ---
    // const verification = await verifyMedicineDetailsWithOpenAI({
    //   medicineName: req.body.medicineName,
    //   dosage: req.body.dosage,
    //   description: req.body.description || "",
    //   takenForSymptoms: req.body.takenForSymptoms || "",
    //   associatedRisks: req.body.associatedRisks || "",

    //   // Optional Phase-2 fields
    //   usage: req.body.usage,
    //   sideEffects: req.body.sideEffects,
    //   warnings: req.body.warnings,
    //   contraindications: req.body.contraindications,
    //   storageInstructions: req.body.storageInstructions,
    //   pregnancySafe: req.body.pregnancySafe,
    //   pediatricUse: req.body.pediatricUse,
    //   adverseReactions: req.body.adverseReactions,
    // });

    // if (!verification.isValid) {
    //   return apiResponse({
    //     res,
    //     status: false,
    //     statusCode: StatusCodes.BAD_REQUEST,
    //     message:
    //       "Medicine details seem invalid. Please correct the information.",
    //   });
    // }

    // 🔍 Handle spiritualOverlayNotes
    if (req.body.spiritualOverlayNotes.length > 0) {
      if (!isAdmin) {
        // Block non-admin users from updating overlays
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.FORBIDDEN,
          message: "Only admins can update spiritual overlay notes.",
        });
      }

      if (Array.isArray(req.body.spiritualOverlayNotes)) {
        const modes = req.body.spiritualOverlayNotes.map((n) => n.mode);
        const uniqueModes = new Set(modes);

        if (modes.length !== uniqueModes.size) {
          return apiResponse({
            res,
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message:
              "Duplicate modes are not allowed in spiritual overlay notes.",
          });
        }
      }
    }

    const updated = await Medicine.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: activityDescriptions.MEDICINE.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Medicine updated.",
      data: updated,
    });
  } catch (error) {
    console.error(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to update medicine.",
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

const deleteMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);

    if (!medicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Medicine not found.",
        data: null,
      });
    }

    const isAdmin = req.user.role?.includes(enumConfig.userRoleEnum.ADMIN);

    // Admin can delete only admin-created medicines
    if (medicine.createdByAdmin && isAdmin) {
      await Medicine.findByIdAndDelete(req.params.id);
    }

    // Users can delete only their own medicines
    else if (
      !medicine.createdByAdmin &&
      medicine.userId.toString() === req.user.id.toString()
    ) {
      await Medicine.findByIdAndDelete(req.params.id);
    }

    // Not allowed to delete
    else {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You are not authorized to delete this medicine.",
        data: null,
      });
    }

    // 🔥 Delete related medicine schedules
    await MedicineSchedule.deleteMany({ medicineName: req.params.id });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: activityDescriptions.MEDICINE.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Medicine deleted successfully.",
      data: null,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to delete medicine.",
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

const getSingleMedicine = async (req, res) => {
  try {
    const { id } = req.params;

    const medicine = await Medicine.findOne({
      _id: id,
    });

    if (!medicine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Medicine not found.",
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: activityDescriptions.MEDICINE.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Medicine fetched successfully.",
      data: medicine,
    });
  } catch (error) {
    console.error("Get Single Medicine Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to fetch medicine.",
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

const getAllMedicines = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;
    const userId = req.user.id || req.user._id;
    const isAdmin = Array.isArray(req.user.role)
      ? req.user.role.includes(enumConfig.userRoleEnum.ADMIN)
      : req.user.role === enumConfig.userRoleEnum.ADMIN;

    // 1) ---------- Read user's perspective from Onboard ----------
    const onboard = await Onboarding.findOne({ userId })
      .select("perspective")
      .lean();

    // 1.1) ---------- Fetch Medicine Disclaimer ----------
    const medicineDisclaimer = await Disclaimer.getByType(
      "medicine_disclaimer"
    );

    const normalizePerspective = (p) => {
      if (!p) return null;
      const values = Object.values(enumConfig.perspectiveEnums);
      const lower = String(p).trim().toLowerCase();
      return values.find((v) => v.toLowerCase() === lower) || null;
    };
    const userPerspective = normalizePerspective(onboard?.perspective);

    // 2) ---------- Pagination & Search ----------
    const parsedLimit = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * parsedLimit;

    const isSearching = typeof search === "string" && search.trim() !== "";
    const regex = isSearching ? new RegExp(search.trim(), "i") : null;

    const searchFilter = isSearching
      ? {
          $or: [
            { medicineName: regex },
            { brandName: regex },
            { description: regex },
          ],
        }
      : {};

    // 3) ---------- Visibility rules ----------
    let baseMatch;
    if (isAdmin) {
      baseMatch = { createdByAdmin: true, ...searchFilter };
    } else {
      // 🔒 Show ONLY:
      //    - user's own docs
      //    - admin-created docs
      // (No other users' docs)
      const userObjectId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;

      baseMatch = {
        $and: [
          {
            $or: [
              { createdByAdmin: true },
              { $expr: { $eq: ["$userId", userObjectId] } },
            ],
          },
          searchFilter,
        ],
      };
    }

    // ---------- Sorting ----------
    let sortPrepStage = null;
    let sortStage;

    if (isSearching) {
      // 🟢 Priority sorting when searching
      sortPrepStage = {
        $addFields: {
          __searchPriority: {
            $switch: {
              branches: [
                {
                  case: { $regexMatch: { input: "$medicineName", regex } },
                  then: 3,
                },
                {
                  case: { $regexMatch: { input: "$brandName", regex } },
                  then: 2,
                },
                {
                  case: { $regexMatch: { input: "$description", regex } },
                  then: 1,
                },
              ],
              default: 0,
            },
          },
        },
      };
      sortStage = { $sort: { __searchPriority: -1, _id: -1 } };
    } else if (isAdmin) {
      sortStage = { $sort: { createdByAdmin: -1, _id: -1 } };
    } else {
      const userObjectId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;

      sortPrepStage = {
        $addFields: {
          __ownPriority: { $cond: [{ $eq: ["$userId", userObjectId] }, 2, 1] },
          __adminPriority: {
            $cond: [{ $eq: ["$createdByAdmin", true] }, 1, 0],
          },
        },
      };
      sortStage = {
        $sort: { __ownPriority: -1, __adminPriority: 1, _id: -1 },
      };
    }

    // ---------- Pagination + Perspective ----------
    const paginateStages = [{ $skip: skip }, { $limit: parsedLimit }];

    const perspectiveStage =
      !isAdmin && userPerspective
        ? [
            {
              $addFields: {
                spiritualOverlayNotes: {
                  $filter: {
                    input: "$spiritualOverlayNotes",
                    as: "noteItem",
                    cond: { $eq: ["$$noteItem.mode", userPerspective] },
                  },
                },
              },
            },
          ]
        : [];

    // ---------- Run aggregate ----------
    const result = await Medicine.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          rows: [
            ...(sortPrepStage ? [sortPrepStage] : []),
            sortStage,
            ...paginateStages,
            ...perspectiveStage,
            ...(sortPrepStage
              ? [
                  {
                    $project: {
                      __searchPriority: 0,
                      __ownPriority: 0,
                      __adminPriority: 0,
                    },
                  },
                ]
              : []),
          ],
          total: [{ $group: { _id: "$_id" } }, { $count: "count" }],
        },
      },
    ]);

    const rows = result?.[0]?.rows || [];
    const totalItems = result?.[0]?.total?.[0]?.count || 0;

    // ---------- Add Disclaimer to each medicine (only if isActive: true) ----------
    const rowsWithDisclaimer = rows.map((medicine) => ({
      ...medicine,
      disclaimer:
        medicineDisclaimer && medicineDisclaimer.isActive === true
          ? {
              id: medicineDisclaimer._id,
              type: medicineDisclaimer.type,
              title: medicineDisclaimer.title,
              content: medicineDisclaimer.content,
              isActive: medicineDisclaimer.isActive,
            }
          : null,
    }));

    // ---------- Log & Respond ----------
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: activityDescriptions.MEDICINE.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Medicines fetched successfully.",
      pagination: {
        page: Number(page),
        limit: parsedLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / parsedLimit),
      },
      data: rowsWithDisclaimer,
      matchedPerspective: isAdmin ? "ALL" : userPerspective || null,
    });
  } catch (error) {
    console.error("Get All Medicines Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to fetch medicine.",
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

/**Scrap data API */
// const getSingleMedicine = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const isObjId = mongoose.Types.ObjectId.isValid(id);

//     // 1) Try MANUAL first (avoid CastError by checking ObjectId)
//     let med = null;
//     if (isObjId) {
//       med = await Medicine.findById(id).lean();
//       if (med) {
//         med = {
//           ...med,
//           sideEffects: Array.isArray(med.sideEffects) ? med.sideEffects : [],
//           warnings: Array.isArray(med.warnings) ? med.warnings : [],
//           contraindications: Array.isArray(med.contraindications) ? med.contraindications : [],
//           adverseReactions: Array.isArray(med.adverseReactions) ? med.adverseReactions : [],
//           createdByAdmin: !!med.createdByAdmin,
//           rxRequired: typeof med.rxRequired === "boolean" ? med.rxRequired : null,
//           source: "manual",
//         };
//       }
//     }

//     // 2) Fallback → SCRAPED (by _id or by setid if FE passes that)
//     if (!med) {
//       const or = [];
//       if (isObjId) or.push({ _id: id });
//       if (/^[0-9a-f-]{10,}$/i.test(id)) or.push({ setid: id }); // UUID-ish setid support

//       const scraped = await DrugsDetails.findOne(
//         or.length ? { $or: or } : { _id: null },
//         { data: 1, createdAt: 1, updatedAt: 1, setid: 1 }
//       ).lean();

//       if (!scraped) {
//         return apiResponse({
//           res,
//           status: false,
//           statusCode: StatusCodes.NOT_FOUND,
//           message: "Medicine not found.",
//         });
//       }

//       // Normalize to SAME FE shape as manual
//       const [norm] = await normalizeScrapedMedicineBatch([scraped]);

//       med = {
//         ...norm,
//         // FE-safety defaults (arrays/booleans/optionals always present)
//         sideEffects: Array.isArray(norm.sideEffects) ? norm.sideEffects : [],
//         warnings: Array.isArray(norm.warnings) ? norm.warnings : [],
//         contraindications: Array.isArray(norm.contraindications) ? norm.contraindications : [],
//         adverseReactions: Array.isArray(norm.adverseReactions) ? norm.adverseReactions : [],
//         userId: SCRAPED_MED_OWNER_ID,
//         createdByAdmin: true,
//         rxRequired: typeof norm.rxRequired === "boolean" ? norm.rxRequired : null,
//         source: "scraped",
//       };

//       // hard defaults in case normalizer couldn’t infer:
//       if (!("_id" in med)) med._id = scraped._id;
//       if (!("medicineName" in med) || !med.medicineName) med.medicineName = "Unknown Medicine";
//       if (!("description" in med)) med.description = "";
//       if (!("brandName" in med)) med.brandName = null;
//       if (!("manufacturer" in med)) med.manufacturer = null;
//       if (!("usage" in med)) med.usage = null;
//       if (!("route" in med)) med.route = null;
//       if (!("singlePack" in med)) med.singlePack = null;
//       if (!("storageInstructions" in med)) med.storageInstructions = null;
//       if (!("pregnancySafe" in med)) med.pregnancySafe = null;
//       if (!("pediatricUse" in med)) med.pediatricUse = null;
//       if (!("dosage" in med)) med.dosage = null;
//       if (!("price" in med)) med.price = null;
//       if (!("quantity" in med)) med.quantity = null;
//       if (!("mfgDate" in med)) med.mfgDate = null;
//       if (!("expDate" in med)) med.expDate = null;
//       if (!("takenForSymptoms" in med)) med.takenForSymptoms = null;
//       if (!("associatedRisks" in med)) med.associatedRisks = null;
//       if (!("image" in med)) med.image = null;
//       if (!("createdAt" in med)) med.createdAt = scraped.createdAt;
//       if (!("updatedAt" in med)) med.updatedAt = scraped.updatedAt;
//     }

//     // Activity log (non-blocking)
//     try {
//       await activityLogService.createActivity({
//         userId: req.user._id,
//         userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//         activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
//         activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
//         description: activityDescriptions.MEDICINE.GET,
//         status: enumConfig.activityStatusEnum.SUCCESS,
//       });
//     } catch (e) {
//       console.warn("⚠️ activityLog failed:", e?.message);
//     }

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Medicine fetched successfully.",
//       data: med,
//     });
//   } catch (error) {
//     console.error("Get Single Medicine Error:", error);
//     try {
//       await activityLogService.createActivity({
//         userId: req.user._id,
//         userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//         activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
//         activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
//         description: error.message || "Failed to fetch medicine.",
//         status: enumConfig.activityStatusEnum.ERROR,
//       });
//     } catch { }
//     return apiResponse({
//       res,
//       status: false,
//       statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
//       message: "Server error.",
//     });
//   }
// };

// const getAllMedicines = async (req, res) => {
//   try {
//     const { search = "", page = 1, limit = 10 } = req.query;

//     const userId = req.user.id;
//     const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

//     const parsedLimit = parseInt(limit, 10);
//     const parsedPage = parseInt(page, 10);
//     const skip = (parsedPage - 1) * parsedLimit;

//     const isSearching = typeof search === "string" && search.trim() !== "";
//     const regex = isSearching ? new RegExp(search.trim(), "i") : null;

//     // ---------- Manual match (admin → only admin-created; user → admin + own) ----------
//     const manualMatch = isAdmin
//       ? { createdByAdmin: true }
//       : { $or: [{ createdByAdmin: true }, { userId }] };

//     if (regex) {
//       manualMatch.$or = [
//         ...(manualMatch.$or || []),
//         { medicineName: regex },
//         { description: regex },
//         { takenForSymptoms: regex },
//         { brandName: regex },
//         { manufacturer: regex },
//         { route: regex },
//       ];
//     }

//     // ---------- Scraped match ----------
//     const scrapedMatch = buildScrapedMedicineMongoFilter({ search });

//     // ---------- Projection for union (light shape) ----------
//     const manualProject = {
//       _id: 1, createdAt: 1, updatedAt: 1,
//       createdByAdmin: 1, userId: 1,
//       medicineName: 1, dosage: 1, description: 1,
//       takenForSymptoms: 1, associatedRisks: 1,
//       price: 1, quantity: 1, singlePack: 1, mfgDate: 1, expDate: 1,
//       brandName: 1, manufacturer: 1, usage: 1, route: 1,
//       sideEffects: 1, warnings: 1, contraindications: 1,
//       storageInstructions: 1, pregnancySafe: 1, pediatricUse: 1,
//       adverseReactions: 1, rxRequired: 1,
//       source: { $literal: "manual" },
//     };

//     // scraped union stage: sirf id/time laao, hydration me normalize karenge
//     const scrapedProject = {
//       _id: 1, createdAt: 1, updatedAt: 1,
//       source: { $literal: "scraped" },
//     };

//     const SCRAPED_COLL = DrugsDetails.collection.collectionName;

//     // ---------- $unionWith + single sort/skip/limit ----------
//     const pipeline = [
//       { $match: manualMatch },
//       { $project: manualProject },
//       {
//         $unionWith: {
//           coll: SCRAPED_COLL,
//           pipeline: [
//             { $match: scrapedMatch },
//             { $project: scrapedProject },
//           ],
//         },
//       },
//       { $sort: { createdAt: -1, _id: -1 } },
//       { $skip: skip },
//       { $limit: parsedLimit },
//     ];

//     const pageSliceLight = await Medicine.aggregate(pipeline);

//     // ---------- Post-hydration ----------
//     const manualIds = [];
//     const scrapedIds = [];
//     for (const it of pageSliceLight) {
//       if (it.source === "manual") manualIds.push(it._id);
//       else scrapedIds.push(it._id);
//     }

//     // Manual hydrate + FE parity
//     let hydratedManual = [];
//     if (manualIds.length) {
//       hydratedManual = await Medicine.find({ _id: { $in: manualIds } }).lean();
//       hydratedManual = hydratedManual.map((m) => ({
//         ...m,
//         sideEffects: Array.isArray(m.sideEffects) ? m.sideEffects : [],
//         warnings: Array.isArray(m.warnings) ? m.warnings : [],
//         contraindications: Array.isArray(m.contraindications) ? m.contraindications : [],
//         adverseReactions: Array.isArray(m.adverseReactions) ? m.adverseReactions : [],
//         createdByAdmin: !!m.createdByAdmin,
//         rxRequired: typeof m.rxRequired === "boolean" ? m.rxRequired : null,
//         source: "manual",
//         // manual me usually __v aata hai; agar missing ho to add kar de:
//         __v: typeof m.__v === "number" ? m.__v : 0,
//       }));
//     }

//     // Scraped hydrate → normalize + FE parity (image remove, __v:0)
//     let hydratedScraped = [];
//     if (scrapedIds.length) {
//       const rawScraped = await DrugsDetails.find(
//         { _id: { $in: scrapedIds } },
//         { data: 1, createdAt: 1, updatedAt: 1 }
//       ).lean();

//       hydratedScraped = await normalizeScrapedMedicineBatch(rawScraped);

//       hydratedScraped = hydratedScraped.map((x) => {
//         const out = {
//           ...x,
//           sideEffects: Array.isArray(x.sideEffects) ? x.sideEffects : [],
//           warnings: Array.isArray(x.warnings) ? x.warnings : [],
//           contraindications: Array.isArray(x.contraindications) ? x.contraindications : [],
//           adverseReactions: Array.isArray(x.adverseReactions) ? x.adverseReactions : [],
//           userId: SCRAPED_MED_OWNER_ID,
//           createdByAdmin: true,
//           rxRequired: typeof x.rxRequired === "boolean" ? x.rxRequired : null,
//           source: "scraped",
//           __v: typeof x.__v === "number" ? x.__v : 0, // ensure __v:0
//         };
//         if ("image" in out) delete out.image; // ensure image removed for FE parity
//         // optional: guarantee lower-case route (mapper already does it)
//         if (typeof out.route === "string") out.route = out.route.toLowerCase();
//         return out;
//       });
//     }

//     // ---------- restore original sort order ----------
//     const manualMap = new Map(hydratedManual.map((d) => [String(d._id), d]));
//     const scrapedMap = new Map(hydratedScraped.map((d) => [String(d._id), d]));
//     const finalPage = pageSliceLight
//       .map((it) => (it.source === "manual" ? manualMap.get(String(it._id)) : scrapedMap.get(String(it._id))))
//       .filter(Boolean);

//     // ---------- totals ----------
//     const totalManual = await Medicine.countDocuments(manualMatch);
//     const totalScraped = await DrugsDetails.countDocuments(scrapedMatch);
//     const totalItems = totalManual + totalScraped;

//     // ---------- activity + response ----------
//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
//       activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
//       description: activityDescriptions.MEDICINE.GET,
//       status: enumConfig.activityStatusEnum.SUCCESS,
//     });

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Medicines fetched successfully.",
//       pagination: {
//         page: Number(page),
//         limit: parsedLimit,
//         totalItems,
//         totalPages: Math.ceil(totalItems / parsedLimit),
//       },
//       data: finalPage,
//     });
//   } catch (error) {
//     console.error("Get All Medicines Error:", error);
//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
//       activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
//       description: error.message || "Failed to fetch medicine.",
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

/**Fetch only login user created medicine */
// const getAllMedicines = async (req, res) => {
//   try {
//     const { search = "", page = 1, limit = 10 } = req.query;
//     const userId = req.user.id;
//     const parsedLimit = parseInt(limit);
//     const skip = (parseInt(page) - 1) * parsedLimit;
//     const regex = new RegExp(search, "i");

//     // Filter for medicines created by the logged-in user
//     const searchFilter = {
//       userId: userId,
//       ...(search && {
//         $or: [
//           { medicineName: regex },
//           { description: regex },
//           { takenForSymptoms: regex },
//         ],
//       }),
//     };

//     const totalItems = await Medicine.countDocuments(searchFilter);
//     const medicines = await Medicine.find(searchFilter)
//       .sort({ createdByAdmin: -1 })
//       .skip(skip)
//       .limit(parsedLimit);

//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
//       activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
//       description: activityDescriptions.MEDICINE.GET,
//       status: enumConfig.activityStatusEnum.SUCCESS,
//     });

//     return apiResponse({
//       res,
//       status: true,
//       statusCode: StatusCodes.OK,
//       message: "Medicines fetched successfully.",
//       pagination: {
//         page: Number(page),
//         limit: parsedLimit,
//         totalItems,
//         totalPages: Math.ceil(totalItems / parsedLimit),
//       },
//       data: medicines,
//     });
//   } catch (error) {
//     console.error("Get All Medicines Error:", error);

//     await activityLogService.createActivity({
//       userId: req.user._id,
//       userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
//       activityType: enumConfig.activityTypeEnum.MEDICINE.GET,
//       activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
//       description: error.message || "Failed to fetch medicine.",
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

const cleanString = (str) => (typeof str === "string" ? str.trim() : str);
const bulkImportMedicines = async (req, res) => {
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
    const medicines = XLSX.utils.sheet_to_json(sheet);

    // ✅ Blank sheet validation
    if (!medicines || medicines.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "No data found in uploaded file. Please add some records.",
      });
    }

    const seenInFile = new Set();
    const uniqueMedicines = [];
    const duplicateEntries = [];
    const invalidEntries = [];

    // Step 1: In-file duplication check
    for (let item of medicines) {
      const key = `${item.medicineName?.trim().toLowerCase()}|${item.dosage
        ?.trim()
        .toLowerCase()}`;
      if (seenInFile.has(key)) {
        duplicateEntries.push({ ...item, reason: "Duplicate in file" });
        continue;
      }
      seenInFile.add(key);
      uniqueMedicines.push(item);
    }

    // Step 2: DB-level duplication check
    const queryOr = uniqueMedicines.map((item) => ({
      userId: req.user.id,
      medicineName: item.medicineName,
      dosage: item.dosage,
    }));

    const existingInDB = await Medicine.find({ $or: queryOr });

    const finalMedicinesToInsert = [];

    for (let item of uniqueMedicines) {
      const exists = existingInDB.find(
        (dbItem) =>
          dbItem.medicineName === item.medicineName &&
          dbItem.dosage === item.dosage &&
          dbItem.userId.toString() === req.user.id
      );

      if (exists) {
        duplicateEntries.push({ ...item, reason: "Already exists in DB" });
      } else {
        // --- Optional: OpenAI Verification Block ---
        // const verification = await verifyMedicineDetailsWithOpenAI({
        //   medicineName: item.medicineName,
        //   dosage: item.dosage,
        //   description: item.description || "",
        //   takenForSymptoms: item.takenForSymptoms || "",
        //   associatedRisks: item.associatedRisks || "",

        //   // Optional Phase-2 fields
        //   usage: item.usage,
        //   sideEffects: item.sideEffects,
        //   warnings: item.warnings,
        //   contraindications: item.contraindications,
        //   storageInstructions: item.storageInstructions,
        //   pregnancySafe: item.pregnancySafe,
        //   pediatricUse: item.pediatricUse,
        //   adverseReactions: item.adverseReactions,
        // });

        // if (!verification.isValid) {
        //   invalidEntries.push({
        //     ...item,
        //     reason: "Invalid details according to OpenAI",
        //   });
        //   continue;
        // }

        finalMedicinesToInsert.push({
          userId: req.user.id,
          medicineName: cleanString(item.medicineName),
          dosage: cleanString(item.dosage),
          description: cleanString(item.description) || "",
          takenForSymptoms: cleanString(item.takenForSymptoms) || "",
          associatedRisks: cleanString(item.associatedRisks) || "",
          price: item.price || 0,
          quantity: item.quantity || 0,
          singlePack: cleanString(item.singlePack) || "",
          mfgDate: commonHelper.convertBulkImportDateToJSDate(item.mfgDate),
          expDate: commonHelper.convertBulkImportDateToJSDate(item.expDate),
          createdByAdmin: isAdmin,

          // ✅ Phase-2 optional fields
          brandName: cleanString(item.brandName) || null,
          manufacturer: cleanString(item.manufacturer) || null,
          usage: cleanString(item.usage) || null,
          route: cleanString(item.route) || null,
          sideEffects: commonHelper.parseBulkImportField(item.sideEffects),
          warnings: commonHelper.parseBulkImportField(item.warnings),
          contraindications: commonHelper.parseBulkImportField(
            item.contraindications
          ),
          storageInstructions: cleanString(item.storageInstructions) || null,
          pregnancySafe: commonHelper.parseBulkImportBoolean(
            item.pregnancySafe
          ),
          pediatricUse: commonHelper.parseBulkImportBoolean(item.pediatricUse),
          adverseReactions: commonHelper.parseBulkImportField(
            item.adverseReactions
          ),
          rxRequired: commonHelper.parseBulkImportBoolean(item.rxRequired),
        });
      }
    }

    // Step 4: Insert final validated entries
    if (finalMedicinesToInsert.length > 0) {
      await Medicine.insertMany(finalMedicinesToInsert);
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.BULK_IMPORT,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: `${finalMedicinesToInsert.length} medicines imported. ${duplicateEntries.length} duplicates skipped. ${invalidEntries.length} invalid entries skipped.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: `${finalMedicinesToInsert.length} medicines imported. ${duplicateEntries.length} duplicates skipped. ${invalidEntries.length} invalid entries skipped.`,
      body: {
        imported: finalMedicinesToInsert.length,
        duplicates: duplicateEntries,
        invalids: invalidEntries,
      },
    });
  } catch (error) {
    console.error("Bulk Import Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.BULK_IMPORT,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to bulk import medicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to import medicines.",
    });
  }
};

const bulkDeleteMedicines = async (req, res) => {
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

    // Step 3: Find existing medicines (only with valid IDs)
    let foundMedicines = [];
    if (validIds.length > 0) {
      foundMedicines = await Medicine.find({ _id: { $in: validIds } });
    }

    const foundIds = foundMedicines.map((m) => m._id.toString());
    const idsNotFound = validIds.filter((id) => !foundIds.includes(id));

    // Step 4: Filter admin-created medicines for deletion
    const deletableMedicines = foundMedicines.filter(
      (m) => m.createdByAdmin === true
    );
    const deletableIds = deletableMedicines.map((m) => m._id.toString());

    const notDeletableIds = foundMedicines
      .filter((m) => m.createdByAdmin !== true)
      .map((m) => m._id.toString());

    // Step 5: Delete only admin-created medicines
    let deletedCount = 0;
    if (deletableIds.length > 0) {
      const deleteResult = await Medicine.deleteMany({
        _id: { $in: deletableIds },
      });
      deletedCount = deleteResult.deletedCount;

      // 🔥 Delete related schedules
      await MedicineSchedule.deleteMany({
        medicineName: { $in: deletableIds },
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.BULK_DELETE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description:
        `${deletedCount} medicine(s) deleted successfully. ` +
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
              " medicine(s) not created by admin and skipped."
            : ""
        }`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    // Step 6: Return detailed response
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message:
        `${deletedCount} medicine(s) deleted successfully. ` +
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
              " medicine(s) not created by admin and skipped."
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
    console.error("Bulk Delete Medicine Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.BULK_DELETE,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to bulk delete medicine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to delete medicines.",
      error: error.message,
    });
  }
};

const getMedicineStockStatus = async (req, res) => {
  try {
    const medicines = await Medicine.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });

    const result = medicines.map((item) => {
      let stockStatus = "In Stock";

      if (item.quantity >= 10) {
        stockStatus = "In Stock";
      } else if (item.quantity > 0 && item.quantity < 6) {
        stockStatus = "Running Low";
      } else if (item.quantity === 0) {
        stockStatus = "Out of Stock";
      }

      return {
        _id: item._id,
        medicineName: item.medicineName,
        dosage: item.dosage,
        quantity: item.quantity,
        unit: item.unit,
        stockStatus,
      };
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.GET_STOCK,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: activityDescriptions.MEDICINE.GET_STOCK,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      message: "Medicine stock fetched successfully.",
      status: true,
      data: result,
    });
  } catch (error) {
    console.error("Medicine Stock Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.GET_STOCK,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to fetch medicine stock.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      status: false,
      data: null,
    });
  }
};

const addQuantityToMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const findMedicine = await Medicine.findOne({
      _id: id,
      userId: req.user.id,
    });

    if (!findMedicine) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Medicine not found",
        status: false,
        data: null,
      });
    }

    findMedicine.quantity += quantity;
    await findMedicine.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.ADD_QUANTITY,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: activityDescriptions.MEDICINE.ADD_QUANTITY,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Quantity added successfully.",
      data: {
        medicineId: findMedicine._id,
        quantity: findMedicine.quantity,
      },
    });
  } catch (error) {
    console.error("Add Quantity Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.ADD_QUANTITY,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to add medicine quantity.",
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

const importMedicineFromJSON = async (req, res) => {
  try {
    let medicines = [];

    if (req.file) {
      const data = fs.readFileSync(req.file.path, "utf8");
      medicines = JSON.parse(data);
      fs.unlinkSync(req.file.path);
    } else if (Array.isArray(req.body)) {
      medicines = req.body;
    } else if (req.body.data) {
      medicines = JSON.parse(req.body.data);
    }

    if (!Array.isArray(medicines) || medicines.length === 0) {
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
    const uniqueMedicines = [];
    const duplicateEntries = [];
    const invalidEntries = [];

    // Step 1: In-file duplication check
    for (const item of medicines) {
      const key = `${item.medicineName?.trim().toLowerCase()}|${item.dosage
        ?.trim()
        .toLowerCase()}`;
      if (seenInFile.has(key)) {
        duplicateEntries.push({ ...item, reason: "Duplicate in file" });
        continue;
      }
      seenInFile.add(key);
      uniqueMedicines.push(item);
    }

    // Step 2: DB-level duplication check
    const queryOr = uniqueMedicines.map((item) => ({
      userId,
      medicineName: item.medicineName,
      dosage: item.dosage,
    }));

    const existingInDB = await Medicine.find({ $or: queryOr });

    const finalMedicinesToInsert = [];

    for (const item of uniqueMedicines) {
      const exists = existingInDB.find(
        (dbItem) =>
          dbItem.medicineName === item.medicineName &&
          dbItem.dosage === item.dosage &&
          dbItem.userId.toString() === userId.toString()
      );

      if (exists) {
        duplicateEntries.push({ ...item, reason: "Already exists in DB" });
        continue;
      }

      // Add to insert list
      finalMedicinesToInsert.push({
        userId,
        medicineName: cleanString(item.medicineName),
        dosage: cleanString(item.dosage),
        description: cleanString(item.description) || "",
        takenForSymptoms: cleanString(item.takenForSymptoms) || "",
        associatedRisks: cleanString(item.associatedRisks) || "",
        price: item.price || 0,
        quantity: item.quantity || 0,
        singlePack: cleanString(item.singlePack) || "",
        mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
        expDate: item.expDate ? new Date(item.expDate) : null,
        createdByAdmin: isAdmin,

        // ✅ Phase-2 optional fields
        brandName: cleanString(item.brandName) || null,
        manufacturer: cleanString(item.manufacturer) || null,
        usage: cleanString(item.usage) || null,
        route: cleanString(item.route) || null,
        sideEffects: Array.isArray(item.sideEffects)
          ? item.sideEffects
          : item.sideEffects?.split(",").map((s) => s.trim()) || [],
        warnings: Array.isArray(item.warnings)
          ? item.warnings
          : item.warnings?.split(",").map((s) => s.trim()) || [],
        contraindications: Array.isArray(item.contraindications)
          ? item.contraindications
          : item.contraindications?.split(",").map((s) => s.trim()) || [],
        storageInstructions: cleanString(item.storageInstructions) || null,
        pregnancySafe:
          item.pregnancySafe !== undefined ? Boolean(item.pregnancySafe) : null,
        pediatricUse:
          item.pediatricUse !== undefined ? Boolean(item.pediatricUse) : null,
        adverseReactions: Array.isArray(item.adverseReactions)
          ? item.adverseReactions
          : item.adverseReactions?.split(",").map((s) => s.trim()) || [],
        rxRequired:
          item.rxRequired !== undefined ? Boolean(item.rxRequired) : null,
      });
    }

    // Step 3: Insert to DB
    if (finalMedicinesToInsert.length > 0) {
      await Medicine.insertMany(finalMedicinesToInsert);
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.IMPORT_JSON,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: `${finalMedicinesToInsert.length} medicines imported. ${duplicateEntries.length} duplicates skipped. ${invalidEntries.length} invalid entries skipped.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    // Step 4: Final response
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: `${finalMedicinesToInsert.length} medicines imported. ${duplicateEntries.length} duplicates skipped. ${invalidEntries.length} invalid entries skipped.`,
      body: {
        imported: finalMedicinesToInsert.length,
        duplicates: duplicateEntries,
        invalids: invalidEntries,
      },
    });
  } catch (error) {
    console.error("Import Medicine from JSON Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.MEDICINE.IMPORT_JSON,
      activityCategory: enumConfig.activityCategoryEnum.MEDICINE,
      description: error.message || "Failed to import medicine from JSON.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to import medicines from JSON.",
      data: null,
    });
  }
};

const getMedicineTemplate = async (req, res) => {
  try {
    // Columns (as per bulkImportMedicines)
    const headers = [
      "medicineName",
      "dosage",
      "description",
      "takenForSymptoms",
      "associatedRisks",
      "price",
      "quantity",
      "singlePack",
      "mfgDate",
      "expDate",
      "brandName",
      "manufacturer",
      "usage",
      "route",
      "sideEffects",
      "warnings",
      "contraindications",
      "storageInstructions",
      "pregnancySafe",
      "pediatricUse",
      "adverseReactions",
      "rxRequired",
    ];

    // Example row
    const exampleRow = {
      medicineName: "Paracetamol",
      dosage: "500mg",
      description: "Used to treat fever and mild to moderate pain",
      takenForSymptoms: "Fever,Headache,Body pain",
      associatedRisks: "Liver damage in overdose",
      price: 50,
      quantity: 10,
      singlePack: "10 tablets",
      mfgDate: "2025-01-01",
      expDate: "2027-01-01",
      brandName: "Crocin",
      manufacturer: "ABC Pharma Ltd.",
      usage: "Take 1 tablet every 6 hours",
      route: "Oral",
      sideEffects: "Nausea,Dizziness",
      warnings: "Avoid alcohol,Overdose risk",
      contraindications: "Liver disease",
      storageInstructions: "Store in a cool, dry place",
      pregnancySafe: "true",
      pediatricUse: "true",
      adverseReactions: "Skin rash",
      rxRequired: "false",
    };

    // --- CSV buffer ---
    const csvHeaders = headers.join(",");
    const escapeCsv = (val) => {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const csvRow = headers.map((h) => escapeCsv(exampleRow[h] ?? "")).join(",");
    const csvContent = `${csvHeaders}\n${csvRow}\n`;
    const csvBuffer = Buffer.from(csvContent, "utf8");

    // --- XLSX buffer ---
    const worksheet = XLSX.utils.json_to_sheet([exampleRow], {
      header: headers,
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    const xlsxBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    // --- Upload to cloud with fixed keys (overwrite each time) ---
    const csvUpload = await fileUploadService.uploadFile({
      buffer: csvBuffer,
      mimetype: "text/csv",
      key: "templates/medicine-template.csv",
    });

    const xlsxUpload = await fileUploadService.uploadFile({
      buffer: xlsxBuffer,
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      key: "templates/medicine-template.xlsx",
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Medicine template URLs",
      body: {
        csv: csvUpload,
        xlsx: xlsxUpload,
      },
    });
  } catch (error) {
    console.error("Medicine template error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to generate medicine template",
    });
  }
};

export default {
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getSingleMedicine,
  getAllMedicines,
  bulkImportMedicines,
  bulkDeleteMedicines,
  getMedicineStockStatus,
  addQuantityToMedicine,
  importMedicineFromJSON,
  getMedicineTemplate,
};
