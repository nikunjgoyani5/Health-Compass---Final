import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import Onboarding from "../models/onboarding.model.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";
import Medicine from "../models/medicine.model.js";
import MedicineScheduleModel from "../models/medicine.schedual.model.js";
import VaccineModel from "../models/vaccine.model.js";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import mongoose from "mongoose";
import UserModel from "../models/user.model.js";
import axios from "axios";

/** Format "hh:mm AM/PM" in given timezone, always 2-digit hour + uppercase AM/PM */
function formatTime12(dateUtc, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).formatToParts(dateUtc);

  const hh = parts.find((p) => p.type === "hour")?.value ?? "12";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dp = (
    parts.find((p) => p.type === "dayPeriod")?.value ?? "AM"
  ).toUpperCase();
  return `${hh}:${mm} ${dp}`;
}

/** Get a future UTC Date + formatted "hh:mm AM/PM" string in tz (min..max minutes ahead) */
function getRandomFuture(tz, minMin = 5, maxMin = 25) {
  const deltaMin = Math.floor(Math.random() * (maxMin - minMin + 1)) + minMin; // inclusive
  const futureUtc = new Date(Date.now() + deltaMin * 60_000);
  const time12 = formatTime12(futureUtc, tz);
  return { futureUtc, time12, deltaMin };
}

const createOnboarding = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const exists = await Onboarding.findOne({ userId: req.user._id }).lean();
    if (exists) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Onboarding entry already exists.",
      });
    }

    const tz = req.user?.timezone || process.env.DEFAULT_TZ || "Asia/Kolkata";

    await session.withTransaction(async () => {
      // 1) Onboarding
      const onboarding = await Onboarding.create(
        [{ ...req.body, userId: req.user._id }],
        { session, ordered: true }
      ).then(([d]) => d);

      // 2) 3 default medicines
      const medicinePayloads = [1, 2, 3].map((i) => ({
        userId: req.user._id,
        medicineName: `Default Medicine ${i}`,
        dosage: "50mg",
        description: "Auto-created medicine.",
        createdByAdmin: false,
        quantity: 50,
        singlePack: "1 tablet",
      }));
      const medicines = await Medicine.insertMany(medicinePayloads, {
        session,
        ordered: true,
      });

      // 3) Medicine schedules (each +5..25 min, time in "hh:mm AM/PM")
      const medSchedules = medicines.map((m) => {
        const { futureUtc, time12 } = getRandomFuture(tz, 5, 25);
        return {
          userId: req.user._id,
          medicineName: m._id,
          dosage: "50mg",
          quantity: 1,
          startDate: futureUtc,
          endDate: futureUtc,
          totalDosesPerDay: 1,
          status: enumConfig.medicineScheduleStatus.ACTIVE,
          doseLogs: [
            {
              date: futureUtc,
              doses: [
                {
                  time: time12, // <-- "01:05 PM"
                  status: enumConfig.scheduleStatusEnums.PENDING,
                  isReminderSent: false,
                },
              ],
            },
          ],
        };
      });
      await MedicineScheduleModel.insertMany(medSchedules, {
        session,
        ordered: true,
      });

      // 4) 3 default vaccines
      const vaccinePayloads = [1, 2, 3].map((i) => ({
        vaccineName: `Default Vaccine ${i}`,
        description: "Auto-created vaccine.",
        createdBy: req.user._id,
        createdByAdmin: false,
      }));
      const vaccines = await VaccineModel.insertMany(vaccinePayloads, {
        session,
        ordered: true,
      });

      // 5) Vaccine schedules (each +5..25 min, time in "hh:mm AM/PM")
      const vacSchedules = vaccines.map((v) => {
        const { futureUtc, time12 } = getRandomFuture(tz, 5, 25);
        return {
          vaccineId: v._id,
          scheduleBy: req.user._id,
          date: futureUtc,
          doseTime: time12, // <-- "02:10 AM"
          reactionDetail: "Auto-created schedule.",
          scheduleStatus: enumConfig.scheduleStatusEnums.PENDING,
          isReminderSent: false,
        };
      });
      await VaccineSchedule.insertMany(vacSchedules, {
        session,
        ordered: true,
      });

      // 6) activity log
      await activityLogService.createActivity(
        {
          userId: req.user._id,
          userRole: Array.isArray(req.user.role)
            ? req.user.role
            : [req.user.role],
          activityType: enumConfig.activityTypeEnum.ONBOARDING.ENTRY,
          activityCategory: enumConfig.activityCategoryEnum.ONBOARDING,
          description:
            "Onboarding + 3 default medicines & vaccines with schedules (future) created",
          status: enumConfig.activityStatusEnum.SUCCESS,
        },
        { session }
      );

      // 7) update gender (inside txn)
      await UserModel.findByIdAndUpdate(
        req.user._id,
        { $set: { gender: req.body.gender } },
        { new: true, session }
      );

      return apiResponse({
        res,
        statusCode: StatusCodes.CREATED,
        status: true,
        data: onboarding,
        message: "Welcome aboard! You're all set to explore the app.",
      });
    });
  } catch (error) {
    console.error(error);
    try {
      await activityLogService.createActivity({
        userId: req.user._id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.ONBOARDING.ENTRY,
        activityCategory: enumConfig.activityCategoryEnum.ONBOARDING,
        description: error.message || "Failed to onboarding entry.",
        status: enumConfig.activityStatusEnum.ERROR,
      });
    } catch {}
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Error creating onboarding entry.",
      error: error?.message,
    });
  } finally {
    session.endSession();
  }
};

const getOnboarding = async (req, res) => {
  try {
    const onboarding = await Onboarding.findOne({
      userId: req.user._id,
    });

    if (!onboarding) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Onboarding entry not found.",
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ONBOARDING.GET,
      activityCategory: enumConfig.activityCategoryEnum.ONBOARDING,
      description: activityDescriptions.ONBOARDING.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      data: onboarding,
      message: "Onboarding entry fetched successfully.",
    });
  } catch (error) {
    console.error(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ONBOARDING.GET,
      activityCategory: enumConfig.activityCategoryEnum.ONBOARDING,
      description: error.message || "Failed to fetch onboarding.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Error fetching onboarding entry.",
    });
  }
};

const updateOnboarding = async (req, res) => {
  try {
    const updatedOnboarding = await Onboarding.findOneAndUpdate(
      { userId: req.user._id },
      { $set: req.body },
      { new: true }
    );

    if (!updatedOnboarding) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Onboarding entry not found.",
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ONBOARDING.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.ONBOARDING,
      description: activityDescriptions.ONBOARDING.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      data: updatedOnboarding,
      message: "Onboarding entry updated successfully.",
    });
  } catch (error) {
    console.error(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ONBOARDING.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.ONBOARDING,
      description: error.message || "Failed to update onboarding entry.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Error updating onboarding entry.",
    });
  }
};

export default {
  createOnboarding,
  getOnboarding,
  updateOnboarding,
};
