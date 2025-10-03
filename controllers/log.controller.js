import { Parser } from "json2csv";
import { AsyncParser } from "json2csv";
import { Transform as Json2CsvTransform } from "json2csv";
import { Readable, PassThrough } from "stream";

import { apiResponse } from "../helper/api-response.helper.js";
import { StatusCodes } from "http-status-codes";
import ActivityLog from "../models/activity-log.model.js";
import helper from "../helper/common.helper.js";
import dayjs from "dayjs";
import AiQueryLog from "../models/aiQuery-log.model.js";
import SupplementViewLog from "../models/supplement-view-log.model.js";
import fileUploadService from "../services/file.upload.service.js";
import enumConfig from "../config/enum.config.js";
import UserModel from "../models/user.model.js";
import SupplementModel from "../models/supplements.model.js";

const getDateFilter = (from, to) => {
  if (from && to) {
    return { $gte: new Date(from), $lte: new Date(to) };
  }
  return undefined;
};

const getPagination = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 10, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// Get activity logs by admins
const getActivityByAdmin = async (req, res) => {
  try {
    const { activityType, activityCategory, status, startDate, endDate, name } =
      req.query;

    let { page = 1, limit = 10 } = req.query;

    const query = {};

    if (activityType) query.activityType = activityType;
    if (activityCategory) query.activityCategory = activityCategory;
    if (typeof status !== "undefined") query.status = status;

    if (startDate && endDate) {
      const start = dayjs(startDate).startOf("day").toDate();
      const end = dayjs(endDate).endOf("day").toDate();
      query.createdAt = { $gte: start, $lte: end };
    }

    const { limit: pageLimit, skip } = helper.paginationFun({ page, limit });

    // 👉 main query
    const logs = await ActivityLog.find(query)
      .populate("userId", "fullName role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean();

    // 👉 filter by fullName if name is passed
    const filteredLogs = logs.filter((log) =>
      name
        ? log.userId?.fullName
            ?.toLowerCase()
            .includes(name.toString().toLowerCase())
        : true
    );

    // 👉 Transform logs
    const formattedLogs = filteredLogs.map((log) => {
      const user = log.userId || {};

      // User role formatting
      let role = "";
      if (Array.isArray(user.role) && user.role.length > 0) {
        role =
          user.role[0].charAt(0).toUpperCase() +
          user.role[0].slice(1).toLowerCase();
      } else if (typeof user.role === "string") {
        role =
          user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
      }

      // Activity category formatting
      let category = log.activityCategory || "";
      if (category) {
        category =
          category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
      }

      return {
        ...log,
        userId: {
          _id: user._id || "",
          fullName: user.fullName || "",
        },
        userRole: role,
        activityCategory: category,
      };
    });

    const total = await ActivityLog.countDocuments(query);

    const pagination = helper.paginationDetails({
      page,
      totalItems: total,
      limit: Number(limit),
    });

    return apiResponse({
      res,
      status: true,
      message: "User activity logs fetched successfully.",
      statusCode: StatusCodes.OK,
      pagination,
      body: formattedLogs,
    });
  } catch (error) {
    console.error("Error while fetching activity logs:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      body: null,
    });
  }
};

// Get AI-Query Logs By Admin
const getAiLogs = async (req, res) => {
  try {
    const filters = {};
    const { anonToken, dateFrom, dateTo, search, model, success } = req.query;

    if (dateFrom && dateTo) filters.createdAt = getDateFilter(dateFrom, dateTo);
    if (anonToken) filters.anonToken = anonToken;
    if (search) filters.query = { $regex: search, $options: "i" };
    if (model) filters.model = model;
    if (success) filters.success = success === "true";

    const { page, limit, skip } = getPagination(req.query);
    const summaryOnly = req.query.summaryOnly === "true";

    const projection = summaryOnly ? { aiResponse: 0 } : {};

    const total = await AiQueryLog.countDocuments(filters);
    const logs = await AiQueryLog.find(filters, projection)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = logs.map((log) => ({
      anonToken: log.anonToken,
      query: log.query,
      response: log.aiResponse?.substring(0, 200),
      model: log.model,
      success: log.success,
      timestamp: log.createdAt,
    }));

    return apiResponse({
      res,
      status: true,
      message: "AI Query logs fetch successfully.",
      statusCode: StatusCodes.OK,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
      data,
    });
  } catch (err) {
    console.error("AI Logs fetch error:", err);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

// Get Supplement View-logs
const getViewLogs = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      anonToken,
      userId,
      supplementId,
      fullName,
      productName,
    } = req.query;

    // 1) Base conditions
    const conditions = [];
    if (dateFrom && dateTo)
      conditions.push({ createdAt: getDateFilter(dateFrom, dateTo) });
    if (anonToken) conditions.push({ anonToken });
    if (userId) conditions.push({ userId });
    if (supplementId) conditions.push({ supplementId });

    const [userIdsByName, suppIdsByName] = await Promise.all([
      fullName
        ? UserModel.find(
            { fullName: { $regex: ".*" + fullName + ".*", $options: "i" } },
            { _id: 1 }
          ).distinct("_id")
        : null,
      productName
        ? SupplementModel.find(
            {
              productName: { $regex: ".*" + productName + ".*", $options: "i" },
            },
            { _id: 1 }
          ).distinct("_id")
        : null,
    ]);

    if (fullName && (!userIdsByName || userIdsByName.length === 0)) {
      return apiResponse({
        res,
        status: true,
        message: "Supplement view logs fetch successfully.",
        statusCode: StatusCodes.OK,
        pagination: {
          page: Number(req.query.page || 1),
          limit: Number(req.query.limit || 10),
          totalPages: 0,
          totalItems: 0,
        },
        body: [],
      });
    }

    if (productName && (!suppIdsByName || suppIdsByName.length === 0)) {
      return apiResponse({
        res,
        status: true,
        message: "Supplement view logs fetch successfully.",
        statusCode: StatusCodes.OK,
        pagination: {
          page: Number(req.query.page || 1),
          limit: Number(req.query.limit || 10),
          totalPages: 0,
          totalItems: 0,
        },
        body: [],
      });
    }

    if (fullName) conditions.push({ userId: { $in: userIdsByName } });
    if (productName) conditions.push({ supplementId: { $in: suppIdsByName } });

    const finalFilter = conditions.length ? { $and: conditions } : {};

    const { page, limit, skip } = getPagination(req.query);

    const total = await SupplementViewLog.countDocuments(finalFilter);

    // 5) Fetch logs with pagination
    const logs = await SupplementViewLog.find(finalFilter)
      .populate("supplementId", "productName brandName")
      .populate("userId", "fullName role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 6) Format response
    const data = logs.map((log) => {
      const roleVal = log?.userId?.role;
      const firstRole = Array.isArray(roleVal) ? roleVal[0] : roleVal;
      const roleCap =
        typeof firstRole === "string" && firstRole.length
          ? firstRole.charAt(0).toUpperCase() + firstRole.slice(1).toLowerCase()
          : firstRole || null;

      return {
        userId: log.userId
          ? {
              _id: log.userId._id,
              fullName: log.userId.fullName,
              role: roleCap,
            }
          : null,
        supplementId: log.supplementId
          ? {
              _id: log.supplementId._id,
              productName: log.supplementId.productName,
              brandName: log.supplementId.brandName,
            }
          : null,
        ip: log.ip,
        referrer: log.referrer,
        anonToken: log.anonToken,
        createdAt: log.createdAt,
      };
    });

    return apiResponse({
      res,
      status: true,
      message: "Supplement view logs fetch successfully.",
      statusCode: StatusCodes.OK,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / (limit || 1)),
        totalItems: total,
      },
      body: data,
    });
  } catch (err) {
    console.error("View Logs fetch error:", err);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

// Export ALL AI Query Logs
const exportAiQueryLogsCSV = async (req, res) => {
  try {
    const logs = await AiQueryLog.find({}).lean().sort({ createdAt: -1 });

    if (!logs || logs.length === 0) {
      return apiResponse({
        res,
        status: false,
        message: "No AI logs found in database",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const fields = [
      "anonToken",
      "query",
      "response",
      "model",
      "success",
      "createdAt",
    ];

    const cleanedData = logs.map((row) => {
      const newRow = {};
      fields.forEach((field) => {
        let value = row[field];
        if (value === undefined || value === null) value = "";
        if (value instanceof Date) value = value.toISOString();
        if (typeof value === "string") value = value.replace(/"/g, '""');
        newRow[field] = value;
      });
      return newRow;
    });

    const parser = new Parser({ fields, quote: '"', delimiter: "," });
    const csv = parser.parse(cleanedData);

    const buffer = Buffer.from(`\uFEFF${csv}`, "utf-8");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ai_logs_${timestamp}.csv`;

    const fileUrl = await fileUploadService.uploadFile({
      buffer,
      mimetype: "text/csv",
      folder: "ai-logs",
    });

    return apiResponse({
      res,
      status: true,
      message: "All AI logs exported successfully",
      statusCode: StatusCodes.OK,
      data: {
        downloadUrl: fileUrl,
        filename,
        totalCount: await AiQueryLog.countDocuments({}),
      },
    });
  } catch (error) {
    console.error("CSV Export Error:", error);
    return apiResponse({
      res,
      status: false,
      message: "Internal server error while exporting AI logs",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// Export ALL Supplement View Logs
const exportAllSupplementViewLogsCSV = async (req, res) => {
  try {
    const logs = await SupplementViewLog.find({})
      .populate(
        "supplementId",
        "productName brandName servingsPerContainer servingSize usageGroup description warnings claims"
      )
      .lean()
      .sort({ createdAt: -1 });

    if (!logs || logs.length === 0) {
      return apiResponse({
        res,
        status: false,
        message: "No Supplement View Logs found in database",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const fields = [
      "supplementId",
      "anonToken",
      "productName",
      "brandName",
      "servingsPerContainer",
      "servingSize",
      "usageGroup",
      "description",
      "warnings",
      "claims",
      "createdAt",
    ];

    const cleanedData = logs.map((row) => {
      const supp = row.supplementId || {};
      return {
        supplementId: supp._id ? String(supp._id) : "",
        anonToken: row.anonToken || "",
        productName: supp.productName || "",
        brandName: supp.brandName || "",
        servingsPerContainer: supp.servingsPerContainer || "",
        servingSize: supp.servingSize || "",
        usageGroup: Array.isArray(supp.usageGroup)
          ? supp.usageGroup.join(", ")
          : "",
        description: supp.description || "",
        warnings: Array.isArray(supp.warnings) ? supp.warnings.join(", ") : "",
        claims: Array.isArray(supp.claims) ? supp.claims.join(", ") : "",
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
      };
    });

    const parser = new Parser({ fields, quote: '"', delimiter: "," });
    const csv = parser.parse(cleanedData);

    const buffer = Buffer.from(`\uFEFF${csv}`, "utf-8");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `supplement_view_logs_${timestamp}.csv`;

    const fileUrl = await fileUploadService.uploadFile({
      buffer,
      mimetype: "text/csv",
      folder: "supplement-view-logs",
    });

    return apiResponse({
      res,
      status: true,
      message:
        "All Supplement View Logs exported successfully with supplement details",
      statusCode: StatusCodes.OK,
      data: {
        downloadUrl: fileUrl,
        filename,
        totalCount: await SupplementViewLog.countDocuments({}),
      },
    });
  } catch (error) {
    console.error("Supplement View Logs CSV Export Error:", error);
    return apiResponse({
      res,
      status: false,
      message: "Internal server error while exporting Supplement View Logs",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

// Export ALL Activity Logs (with full details) to CSV
const exportAllActivityLogsCSV = async (req, res) => {
  try {
    const fields = [
      "userId",
      "userName",
      "userEmail",
      "userRole",
      "activityType",
      "activityCategory",
      "description",
      "status",
      "errorMessage",
      "errorCode",
      "errorDetails",
      "createdAt",
    ];

    // Keep pipeline lean; sort first so index can help / spill is possible.
    const pipeline = [
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { fullName: 1, email: 1, role: 1 } }],
        },
      },
      { $addFields: { user: { $first: "$user" } } },
      {
        $project: {
          user: 1,
          activityType: 1,
          activityCategory: 1,
          description: 1,
          status: 1,
          "error.message": 1,
          "error.code": 1,
          "error.details": 1,
          createdAt: 1,
        },
      },
    ];

    // ✅ Native driver aggregate gives a real cursor; allow disk spill.
    const cursor = ActivityLog.collection.aggregate(pipeline, {
      allowDiskUse: true,
    });
    cursor.batchSize(1000);

    // A Readable that we'll push JSON rows into (objectMode).
    const jsonReadable = new Readable({
      objectMode: true,
      read() {}, // we'll push manually
    });

    // json2csv Transform stream (stable across versions)
    const json2csv = new Json2CsvTransform({
      fields,
      quote: '"',
      delimiter: ",",
    });

    // We'll collect CSV into chunks, then upload. (Still streaming; memory ~chunks)
    const passthrough = new PassThrough();
    const chunks = [];

    // Prepend UTF-8 BOM for Excel
    chunks.push(Buffer.from("\uFEFF", "utf-8"));

    passthrough.on("data", (chunk) => chunks.push(chunk));
    passthrough.on("error", (err) => {
      console.error("CSV stream error:", err);
      return apiResponse({
        res,
        status: false,
        message: "CSV generation failed",
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      });
    });

    passthrough.on("end", async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `activity_logs_${timestamp}.csv`;

        const fileUrl = await fileUploadService.uploadFile({
          buffer,
          mimetype: "text/csv",
          folder: "activity-logs",
        });

        const totalCount = await ActivityLog.estimatedDocumentCount();

        return apiResponse({
          res,
          status: true,
          message: "All Activity Logs exported successfully",
          statusCode: StatusCodes.OK,
          data: { downloadUrl: fileUrl, filename, totalCount },
        });
      } catch (uploadErr) {
        console.error("Upload error:", uploadErr);
        return apiResponse({
          res,
          status: false,
          message: "Upload failed while exporting Activity Logs",
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        });
      }
    });

    // Pipe: JSON objects -> json2csv -> passthrough (collect chunks)
    jsonReadable.pipe(json2csv).pipe(passthrough);

    // Feed the cursor into the JSON Readable
    (async () => {
      try {
        for await (const doc of cursor) {
          const user = doc.user || {};
          const roleVal = Array.isArray(user?.role)
            ? user.role.join(", ")
            : user?.role || "";

          jsonReadable.push({
            userId: user?._id ? String(user._id) : "",
            userName: user?.fullName || "",
            userEmail: user?.email || "",
            userRole: roleVal,
            activityType: doc.activityType || "",
            activityCategory: doc.activityCategory || "",
            description: doc.description || "",
            status: doc.status || "",
            errorMessage: doc.error?.message || "",
            errorCode: doc.error?.code || "",
            errorDetails: doc.error?.details
              ? JSON.stringify(doc.error.details)
              : "",
            createdAt: doc.createdAt
              ? new Date(doc.createdAt).toISOString()
              : "",
          });
        }
      } catch (cursorErr) {
        console.error("Cursor iteration error:", cursorErr);
        // End streams so on('error')/response can fire
      } finally {
        // Signal end of data -> flush CSV and trigger passthrough 'end'
        jsonReadable.push(null);
      }
    })();
  } catch (error) {
    console.error("Activity Logs CSV Export Error:", error);
    return apiResponse({
      res,
      status: false,
      message: "Internal server error while exporting Activity Logs",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const getActivityCategoryFilter = async (req, res) => {
  try {
    const categories = Object.entries(enumConfig.activityCategoryEnum).map(
      ([key, value]) => ({
        key,
        label: value,
      })
    );

    return apiResponse({
      res,
      status: true,
      message: "Activity categories fetched successfully",
      statusCode: StatusCodes.OK,
      body: categories,
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      body: null,
    });
  }
};

export default {
  getActivityByAdmin,
  getAiLogs,
  getViewLogs,
  exportAiQueryLogsCSV,
  exportAllSupplementViewLogsCSV,
  exportAllActivityLogsCSV,
  getActivityCategoryFilter,
};
