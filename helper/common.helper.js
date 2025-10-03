import path from "path";
import multer from "multer";
import moment from "moment";
import jwt from "jsonwebtoken";
import config from "../config/config.js";
import UserModel from "../models/user.model.js";
import { StatusCodes } from "http-status-codes";

// ----------- Pagination -----------
const paginationDetails = ({ page = 1, totalItems, limit }) => {
  const totalPages = Math.ceil(totalItems / limit);
  return { page: Number(page), totalPages, totalItems, limit };
};

const paginationFun = (data) => {
  const { page = 1, limit = 10 } = data;
  return {
    limit: Number(limit),
    skip: (Number(page) - 1) * Number(limit),
  };
};

// ------------- Token -------------
const generateToken = async (payload, expiresIn = "30d") => {
  return jwt.sign(payload, config.jwt.secretKey, {
    expiresIn: expiresIn,
  });
};

const verifyToken = async (token) => {
  return jwt.verify(token, config.jwt.secretKey);
};

// ------------- Generate OTP -------------
const generateOTP = () => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  const otpExpiryDurationSeconds = 60;
  const otpExpiresAt = moment()
    .add(otpExpiryDurationSeconds, "seconds")
    .toDate();
  return { otp, otpExpiresAt };
};

const generateOTPArray = (length, count) => {
  const otpArray = [];

  for (let i = 0; i < count; i++) {
    const otp = Math.floor(Math.random() * Math.pow(10, length));
    otpArray.push(otp);
  }

  return otpArray;
};

// ------------- Formatting -------------
const formatDateToString = (date) => {
  return `${date.getFullYear()}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}${date
    .getHours()
    .toString()
    .padStart(2, "0")}${date.getMinutes().toString().padStart(2, "0")}${date
    .getSeconds()
    .toString()
    .padStart(2, "0")}`;
};

const convertUtcToLocal = (utcTimestamp) => {
  const utcTime = moment.utc(utcTimestamp);
  if (!utcTime.isValid()) {
    throw new Error("Invalid UTC timestamp format.");
  }
  const localTime = utcTime.local();
  return localTime.format("DD-MM-YYYY HH:mm:ss");
};

const validateEntitiesExistence = async (entities) => {
  const results = await Promise.all(
    entities.map(async ({ model, id, name }) => {
      const entity = await model.findById(id);
      return entity ? null : `${name} with ID ${id} not found`;
    })
  );
  return results.filter((result) => result !== null);
};

const toBoolean = (value) => {
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return value;
};

const extractFileKey = (url) => {
  const parts = url.split("/");
  const fileKey = parts.slice(3).join("/");
  return fileKey;
};

const ensureUserId = async (userId, email) => {
  if (userId) return userId;
  try {
    const user = await UserModel.findOne({ email });
    return user ? user._id.toString() : "Not Found";
  } catch (err) {
    console.error("Error fetching user by email:", err.message);
    return "ErrorFetching";
  }
};

const generateInviteCode = async () => {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return "#" + code;
};

const filteredUser = (user) => {
  const {
    password,
    otp,
    otpExpiresAt,
    createdAt,
    updatedAt,
    expiresIn,
    otpVerified,
    is_deleted,
    is_verified,
    provider,
    providerId,
    paymentStatus,
    subscriptionDetails,
    countryCode,
    ...filteredUser
  } = user.toObject();
  return filteredUser;
};

const validateFutureDate = (inputDate) => {
  const today = new Date();
  const passedDate = new Date(inputDate);
  today.setHours(0, 0, 0, 0);
  passedDate.setHours(0, 0, 0, 0);
  return passedDate >= today;
};

const validateFutureTime = (timeStr) => {
  const now = new Date();
  const timeParts = timeStr.match(/(\d+):(\d+)\s?(AM|PM)/i);
  if (!timeParts) {
    throw {
      statusCode: StatusCodes.BAD_REQUEST,
      message: "Invalid time format. Use 'HH:MM AM/PM'.",
    };
  }

  let [_, hour, minute, period] = timeParts;
  hour = parseInt(hour);
  minute = parseInt(minute);
  if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (period.toUpperCase() === "AM" && hour === 12) hour = 0;

  const inputTime = new Date();
  inputTime.setHours(hour, minute, 0, 0);

  return inputTime < now;
};

const validateFutureDateTime = (dateString, timeString) => {
  const now = new Date();

  // Parse the provided date
  const [month, day, year] = new Date(dateString)
    .toLocaleDateString("en-US")
    .split("/");
  const [time, modifier] = timeString.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier === "PM" && hours !== 12) {
    hours += 12;
  }
  if (modifier === "AM" && hours === 12) {
    hours = 0;
  }

  const passedDateTime = new Date(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hours
      .toString()
      .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`
  );

  return passedDateTime < now;
};

const parseBulkImportField = (field) => {
  if (!field || typeof field !== "string" || field.trim() === "") return null;

  // Already an array
  if (Array.isArray(field)) return field;

  try {
    const cleaned = field
      .replace(/'/g, '"') // convert single quotes to double quotes
      .replace(/,\s*]/g, "]"); // handle ["a", "b", ] → ["a", "b"]

    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      const result = parsed.map((s) => String(s).trim()).filter((s) => s);
      return result.length > 0 ? result : null;
    }
  } catch (err) {
    const result = field
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    return result.length > 0 ? result : null;
  }

  return null;
};

const convertBulkImportDateToJSDate = (excelDate) => {
  if (!excelDate) return null;

  if (typeof excelDate === "number") {
    return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
  }

  // Handle string like "2025-03-25"
  const parsed = new Date(excelDate);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseBulkImportBoolean = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "boolean") return value;

  if (typeof value === "number") return value === 1;

  if (typeof value === "string") {
    const val = value.trim().toLowerCase();
    if (val === "true" || val === "yes" || val === "1") return true;
    if (val === "false" || val === "no" || val === "0") return false;
  }

  return null;
};

export const getIPv4Address = (req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip;

  // Convert ::ffff:127.0.0.1 or ::1 to IPv4
  if (ip?.startsWith("::ffff:")) return ip.replace("::ffff:", "");
  if (ip === "::1") return "127.0.0.1";

  return ip;
};

export const createMulterUpload = (
  allowedExtensions,
  storageType = "memory"
) => {
  const storage =
    storageType === "memory"
      ? multer.memoryStorage()
      : multer.diskStorage({
          destination: "uploads/",
          filename: (req, file, cb) => {
            cb(null, Date.now() + path.extname(file.originalname));
          },
        });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return cb(
        new Error(`Only ${allowedExtensions.join(", ")} files are allowed`),
        false
      );
    }
    cb(null, true);
  };

  return multer({ storage, fileFilter });
};

export default {
  generateOTP,
  verifyToken,
  generateToken,
  paginationDetails,
  paginationFun,
  extractFileKey,
  formatDateToString,
  convertUtcToLocal,
  validateEntitiesExistence,
  toBoolean,
  generateOTPArray,
  ensureUserId,
  generateInviteCode,
  filteredUser,
  validateFutureDate,
  validateFutureTime,
  validateFutureDateTime,
  parseBulkImportField,
  convertBulkImportDateToJSDate,
  parseBulkImportBoolean,
};
