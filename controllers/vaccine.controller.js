import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import VaccineModel from "../models/vaccine.model.js";
import helper from "../helper/common.helper.js";
import enumConfig from "../config/enum.config.js";
import XLSX from "xlsx";
import mongoose from "mongoose";
import fs from "fs";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import Onboarding from "../models/onboarding.model.js";
import Disclaimer from "../models/disclaimer.model.js";
import fileUploadService from "../services/file.upload.service.js";

const cleanString = (str) => (typeof str === "string" ? str.trim() : str);

// --- create vaccine detail ---
const createVaccine = async (req, res) => {
  try {
    const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

    const { vaccineName, provider, description, spiritualOverlayNotes } =
      req.body;

    // 1. Check if already exists
    const findVaccine = await VaccineModel.findOne({
      vaccineName,
      provider,
      createdBy: req.user._id,
    });
    if (findVaccine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "This vaccine already exists.",
      });
    }

    // 2. Build vaccine object
    const newVaccine = {
      vaccineName,
      provider,
      description,
      createdBy: req.user._id,
      createdByAdmin: isAdmin,
    };

    // 3. Handle spiritualOverlayNotes (Admins only)
    if (isAdmin) {
      if (
        !Array.isArray(spiritualOverlayNotes) ||
        spiritualOverlayNotes.length === 0
      ) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Spiritual overlay notes is required.",
          data: null,
        });
      }

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

      newVaccine.spiritualOverlayNotes = spiritualOverlayNotes;
    }

    // ❌ Non-admins cannot send overlay notes
    if (!isAdmin && spiritualOverlayNotes && spiritualOverlayNotes.length > 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "Only admins can add spiritual overlay notes.",
        data: null,
      });
    }

    // 4. Save
    const result = await VaccineModel.create(newVaccine);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: activityDescriptions.VACCINE.CREATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      data: result,
      message: "Vaccine created successfully.",
    });
  } catch (error) {
    console.error("Create Vaccine Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: error.message || "Failed to create vaccine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

// Without separate admin and user key
const getVaccine = async (req, res) => {
  const { search = "" } = req.query;
  try {
    const pagination = helper.paginationFun(req.query);
    const searchRegex = new RegExp(search, "i");

    const currentUserId = req.user.id || req.user._id;
    const isAdmin = Array.isArray(req.user.role)
      ? req.user.role.includes(enumConfig.userRoleEnum.ADMIN)
      : req.user.role === enumConfig.userRoleEnum.ADMIN;

    // -- perspective from onboarding
    const onboardData = await Onboarding.findOne({
      userId: req.user._id,
    }).lean();

    // ---------- Fetch Vaccine Disclaimer ----------
    const vaccineDisclaimer = await Disclaimer.getByType("vaccine_disclaimer");
    const normalizePerspective = (p) => {
      if (!p) return null;
      const values = Object.values(enumConfig.perspectiveEnums);
      const lower = String(p).trim().toLowerCase();
      return values.find((v) => v.toLowerCase() === lower) || null;
    };
    const userPerspective =
      normalizePerspective(onboardData?.perspective) ||
      enumConfig.perspectiveEnums.BALANCED;

    // -- search filter
    const searchCondition = search
      ? {
          $or: [
            { vaccineName: { $regex: searchRegex } },
            { provider: { $regex: searchRegex } },
          ],
        }
      : {};

    // -- visibility filter
    const userObjectId = mongoose.Types.ObjectId.isValid(currentUserId)
      ? new mongoose.Types.ObjectId(currentUserId)
      : currentUserId;

    // Admin sees only admin-created (preserving your original intent).
    const baseMatch = isAdmin
      ? { createdByAdmin: true, ...searchCondition }
      : {
          $and: [
            {
              $or: [
                { createdByAdmin: true },
                { $expr: { $eq: ["$createdBy", userObjectId] } }, // only own docs
              ],
            },
            searchCondition,
          ],
        };

    // -- aggregation with own-first ordering and overlay filtering
    const pipeline = [
      { $match: baseMatch },

      // prepare priority fields only for non-admins (own first, admin second)
      ...(!isAdmin
        ? [
            {
              $addFields: {
                __ownPriority: {
                  $cond: [{ $eq: ["$createdBy", userObjectId] }, 2, 1],
                },
                __adminPriority: {
                  $cond: [{ $eq: ["$createdByAdmin", true] }, 1, 0],
                },
              },
            },
          ]
        : []),

      // sort: own first, then admin; newest in each bucket
      {
        $sort: isAdmin
          ? { createdByAdmin: -1, _id: -1 }
          : { __ownPriority: -1, __adminPriority: 1, _id: -1 },
      },

      // paginate
      { $skip: pagination.skip },
      { $limit: pagination.limit },

      // filter spiritualOverlayNotes by perspective
      {
        $addFields: {
          spiritualOverlayNotes: isAdmin
            ? "$spiritualOverlayNotes" // ✅ admin gets all notes
            : {
                $cond: [
                  {
                    $gt: [
                      { $size: { $ifNull: ["$spiritualOverlayNotes", []] } },
                      0,
                    ],
                  },
                  {
                    $filter: {
                      input: "$spiritualOverlayNotes",
                      as: "noteItem",
                      cond: { $eq: ["$$noteItem.mode", userPerspective] },
                    },
                  },
                  "$spiritualOverlayNotes",
                ],
              },
        },
      },

      // populate createdBy (fullName, email, profileImage, role)
      {
        $lookup: {
          from: "users", // <-- ensure this matches your actual collection name
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy",
          pipeline: [
            { $project: { fullName: 1, email: 1, profileImage: 1, role: 1 } },
          ],
        },
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },

      // clean internal fields
      ...(!isAdmin
        ? [{ $project: { __ownPriority: 0, __adminPriority: 0 } }]
        : []),
    ];

    // total count (same filter, no paging)
    const totalItems = await VaccineModel.countDocuments(baseMatch);

    // run aggregation
    const vaccines = await VaccineModel.aggregate(pipeline);

    // ---------- Add Disclaimer to each vaccine (only if isActive: true) ----------
    const vaccinesWithDisclaimer = vaccines.map((vaccine) => ({
      ...vaccine,
      disclaimer:
        vaccineDisclaimer && vaccineDisclaimer.isActive === true
          ? {
              id: vaccineDisclaimer._id,
              type: vaccineDisclaimer.type,
              title: vaccineDisclaimer.title,
              content: vaccineDisclaimer.content,
              isActive: vaccineDisclaimer.isActive,
            }
          : null,
    }));

    // pagination details
    const paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: activityDescriptions.VACCINE.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      pagination: paginationData,
      data: vaccinesWithDisclaimer,
      message: "Vaccine fetched successfully.",
    });
  } catch (error) {
    console.error("Get Vaccine Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.GET,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: error.message || "Failed to fetch vaccine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

// --- update vaccine schedule ---
const updateVaccine = async (req, res) => {
  try {
    const { vaccineId } = req.params;
    const updateFields = req.body;

    const vaccine = await VaccineModel.findById(vaccineId);

    if (!vaccine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine not found.",
      });
    }

    const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);
    const isCreator = vaccine.createdBy?.toString() === req.user._id.toString();

    // 🔐 Authorization Check
    if (!isAdmin && !isCreator) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message: "You are not authorized to update this vaccine.",
      });
    }

    // 🔍 Duplicate Vaccine Name + Provider Check
    if (updateFields.vaccineName && updateFields.provider) {
      const existingVaccine = await VaccineModel.findOne({
        _id: { $ne: vaccineId },
        vaccineName: updateFields.vaccineName,
        provider: updateFields.provider,
        createdBy: req.user._id,
      });

      if (existingVaccine) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "This vaccine already exists.",
        });
      }
    }

    // 🧾 Handle spiritualOverlayNotes
    if (
      updateFields.spiritualOverlayNotes &&
      updateFields.spiritualOverlayNotes.length > 0
    ) {
      if (!isAdmin) {
        // ❌ Block non-admins from adding/updating overlay notes
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.FORBIDDEN,
          message: "Only admins can update spiritual overlay notes.",
        });
      }

      if (Array.isArray(updateFields.spiritualOverlayNotes)) {
        const modes = updateFields.spiritualOverlayNotes.map((n) => n.mode);
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

        // ✅ Validate that each mode is valid
        const invalidMode = updateFields.spiritualOverlayNotes.find(
          (n) =>
            !n.mode ||
            !Object.values(enumConfig.perspectiveEnums).includes(n.mode)
        );
        if (invalidMode) {
          return apiResponse({
            res,
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Invalid perspective mode: ${invalidMode.mode}`,
          });
        }
      }
    }

    // ✅ Update vaccine
    const result = await VaccineModel.findByIdAndUpdate(
      vaccineId,
      { $set: updateFields },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: activityDescriptions.VACCINE.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: result,
      message: "Vaccine details updated successfully.",
    });
  } catch (error) {
    console.error("Update Vaccine Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: error.message || "Failed to update vaccine.",
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

// --- delete vaccine ---
const deleteVaccine = async (req, res) => {
  try {
    const { id } = req.params;
    const vaccine = await VaccineModel.findById(id);

    if (!vaccine) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Vaccine not found.",
        data: null,
      });
    }

    const isAdmin = req.user.role?.includes(enumConfig.userRoleEnum.ADMIN);

    // Admin can delete vaccines created by admin
    if (vaccine.createdByAdmin && isAdmin) {
      await VaccineModel.findByIdAndDelete(id);
    }
    // User can delete only their own vaccines
    else if (
      !vaccine.createdByAdmin &&
      vaccine.createdBy.toString() === req.user._id.toString()
    ) {
      await VaccineModel.findByIdAndDelete(id);
    }
    // Not allowed
    else {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.UNAUTHORIZED,
        message: "You are not authorized to delete this vaccine.",
        data: null,
      });
    }

    // 🔥 Delete related schedules
    await VaccineSchedule.deleteMany({ vaccineId: id });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: activityDescriptions.VACCINE.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: null,
      message: "Vaccine deleted successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: error.message || "Failed to delete vaccine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

// --- bulk import vaccine ---
const bulkImportVaccines = async (req, res) => {
  if (!req.file) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: "No file uploaded.",
    });
  }
  const isAdmin = req.user.role?.includes(enumConfig.userRoleEnum.ADMIN);

  try {
    const fileBuffer = req.file.buffer;
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const vaccines = XLSX.utils.sheet_to_json(sheet);

    // ✅ Blank sheet validation
    if (!vaccines || vaccines.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "No data found in uploaded file. Please add some records.",
      });
    }

    const seenInFile = new Set();
    const uniqueVaccines = [];
    const duplicateEntries = [];
    const invalidEntries = [];

    // Step 1: In-file duplication check
    for (let item of vaccines) {
      const key = `${item.vaccineName?.trim().toLowerCase()}|${item.provider
        ?.trim()
        .toLowerCase()}`;
      if (seenInFile.has(key)) {
        duplicateEntries.push({ ...item, reason: "Duplicate in file" });
        continue;
      }
      seenInFile.add(key);
      uniqueVaccines.push(item);
    }

    // Step 2: DB-level duplication check
    const queryOr = uniqueVaccines.map((item) => ({
      createdBy: req.user.id,
      vaccineName: item.vaccineName,
      provider: item.provider,
    }));

    const existingInDB = await VaccineModel.find({ $or: queryOr });

    const finalVaccinesToInsert = [];

    for (let item of uniqueVaccines) {
      const exists = existingInDB.find(
        (dbItem) =>
          dbItem.vaccineName === item.vaccineName &&
          dbItem.provider === item.provider &&
          dbItem.createdBy.toString() === req.user.id
      );

      if (exists) {
        duplicateEntries.push({ ...item, reason: "Already exists in DB" });
      } else {
        finalVaccinesToInsert.push({
          createdBy: req.user.id,
          vaccineName: cleanString(item.vaccineName),
          provider: cleanString(item.provider),
          description: cleanString(item.description) || "",
          createdByAdmin: isAdmin,
        });
      }
    }

    // Step 3: Insert final validated entries
    if (finalVaccinesToInsert.length > 0) {
      await VaccineModel.insertMany(finalVaccinesToInsert);
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.BULK_IMPORT,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: `${finalVaccinesToInsert.length} vaccines imported. ${duplicateEntries.length} duplicates skipped. ${invalidEntries.length} invalid entries skipped.`,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: `${finalVaccinesToInsert.length} vaccines imported. ${duplicateEntries.length} duplicates skipped. ${invalidEntries.length} invalid entries skipped.`,
      body: {
        imported: finalVaccinesToInsert.length,
        duplicates: duplicateEntries,
        invalids: invalidEntries,
      },
    });
  } catch (error) {
    console.error("Bulk Import Vaccine Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.BULK_IMPORT,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: error.message || "Failed to bulk import vaccine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to import vaccines.",
    });
  }
};

const bulkDeleteVaccines = async (req, res) => {
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

    // Step 3: Find existing vaccines
    let foundVaccines = [];
    if (validIds.length > 0) {
      foundVaccines = await VaccineModel.find({ _id: { $in: validIds } });
    }

    const foundIds = foundVaccines.map((v) => v._id.toString());
    const idsNotFound = validIds.filter((id) => !foundIds.includes(id));

    // Step 4: Filter only admin-created vaccines
    const deletableVaccines = foundVaccines.filter(
      (v) => v.createdByAdmin === true
    );
    const deletableIds = deletableVaccines.map((v) => v._id.toString());

    const notDeletableIds = foundVaccines
      .filter((v) => v.createdByAdmin !== true)
      .map((v) => v._id.toString());

    // Step 5: Delete only those created by admin
    let deletedCount = 0;
    if (deletableIds.length > 0) {
      const deleteResult = await VaccineModel.deleteMany({
        _id: { $in: deletableIds },
      });
      deletedCount = deleteResult.deletedCount;

      // 🔥 Delete related schedules
      await VaccineSchedule.deleteMany({ vaccineId: { $in: deletableIds } });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.BULK_DELETE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description:
        `${deletedCount} vaccine(s) deleted successfully. ` +
        `${
          invalidIds.length > 0
            ? invalidIds.length + " invalid ID(s) provided. "
            : ""
        }` +
        `${
          idsNotFound.length > 0
            ? idsNotFound.length + " ID(s) not found in the database. "
            : ""
        }` +
        `${
          notDeletableIds.length > 0
            ? notDeletableIds.length +
              " vaccine(s) not created by admin and skipped."
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
        `${deletedCount} vaccine(s) deleted successfully. ` +
        `${
          invalidIds.length > 0
            ? invalidIds.length + " invalid ID(s) provided. "
            : ""
        }` +
        `${
          idsNotFound.length > 0
            ? idsNotFound.length + " ID(s) not found in the database. "
            : ""
        }` +
        `${
          notDeletableIds.length > 0
            ? notDeletableIds.length +
              " vaccine(s) not created by admin and skipped."
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
    console.error("Bulk Delete Vaccine Error:", error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.BULK_DELETE,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: error.message || "Failed to bulk delete vaccine.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to delete vaccines.",
      error: error.message,
    });
  }
};

const importVaccinesFromJSON = async (req, res) => {
  try {
    let vaccines = [];

    if (req.file) {
      const data = fs.readFileSync(req.file.path, "utf8");
      vaccines = JSON.parse(data);
      fs.unlinkSync(req.file.path); // remove file after reading
    } else if (Array.isArray(req.body)) {
      vaccines = req.body;
    } else if (req.body.data) {
      vaccines = JSON.parse(req.body.data);
    }

    if (!Array.isArray(vaccines) || vaccines.length === 0) {
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

    const newVaccines = [];

    for (const v of vaccines) {
      const vaccineName = cleanString(v.vaccineName);

      if (!vaccineName) continue;

      const alreadyExists = await VaccineModel.findOne({
        vaccineName: { $regex: new RegExp(`^${vaccineName}$`, "i") },
        createdBy: userId,
      });

      if (alreadyExists) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.CONFLICT,
          data: null,
          message: `Vaccine '${vaccineName}' already exists for this user.`,
        });
      }

      newVaccines.push({
        vaccineName,
        provider: cleanString(v.provider),
        description: cleanString(v.description),
        createdBy: userId,
        createdByAdmin: isAdmin,
      });
    }

    if (newVaccines.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message: "No new vaccines to import.",
      });
    }

    const result = await VaccineModel.insertMany(newVaccines);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.IMPORT_JSON,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: activityDescriptions.VACCINE.IMPORT_JSON,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      data: result,
      message: "Vaccines imported successfully.",
    });
  } catch (error) {
    console.error("Vaccine Import Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.VACCINE.IMPORT_JSON,
      activityCategory: enumConfig.activityCategoryEnum.VACCINE,
      description: error.message || "Failed to import vaccine from JSON.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

const getVaccineTemplate = async (req, res) => {
  try {
    const columns = ["vaccineName", "provider", "description"];

    // ✅ Sample 10 vaccine records
    const sampleData = [
      [
        "MMR Vaccine",
        "HealthCare Pharma",
        "Protects against measles, mumps, and rubella",
      ],
      ["Hepatitis B Vaccine", "BioHealth", "Prevents hepatitis B infection"],
      ["Polio Vaccine", "ImmunoLife", "Protects against poliomyelitis"],
      ["Influenza Vaccine", "FluGuard", "Seasonal flu vaccine"],
      ["Tetanus Vaccine", "SafeMed", "Prevents tetanus infection"],
      ["COVID-19 Vaccine", "Global Pharma", "Prevents COVID-19 disease"],
      ["BCG Vaccine", "ImmuniCare", "Prevents tuberculosis in infants"],
      ["Varicella Vaccine", "VaxWell", "Protects against chickenpox"],
      ["HPV Vaccine", "HealthPlus", "Prevents human papillomavirus infection"],
      ["Rabies Vaccine", "AnimalCare", "Prevents rabies infection"],
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
      key: "templates/vaccines_template_sample.csv",
    });

    // XLS Template with sample data
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([columns, ...sampleData]);
    XLSX.utils.book_append_sheet(wb, ws, "Vaccines");
    const xlsBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    const xlsUpload = await fileUploadService.uploadFile({
      buffer: xlsBuffer,
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      key: "templates/vaccines_template_sample.xlsx",
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Vaccine sample template ready",
      data: {
        csv: csvUpload,
        xls: xlsUpload,
      },
    });
  } catch (error) {
    console.error("Vaccine Template Error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to generate vaccine template.",
    });
  }
};

export default {
  createVaccine,
  getVaccine,
  updateVaccine,
  deleteVaccine,
  bulkImportVaccines,
  bulkDeleteVaccines,
  importVaccinesFromJSON,
  getVaccineTemplate,
};
