import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import MedicineScheduleModel from "../models/medicine.schedual.model.js";
import enumConfig from "../config/enum.config.js";
import activityLogService from "../services/activity-log.service.js";

const getMedicineUsage = async (req, res) => {
  try {
    const userId = req.user.id;

    const schedules = await MedicineScheduleModel.find({ userId })
      .populate("medicineName", "medicineName")
      .lean();

    // Step 1: Calculate takenCount for each medicine
    const usageData = schedules
      .map((schedule) => {
        let takenCount = 0;

        schedule.doseLogs?.forEach((day) => {
          day.doses?.forEach((dose) => {
            if (dose.status === enumConfig.scheduleStatusEnums.TAKEN) {
              takenCount++;
            }
          });
        });

        return {
          medicineName: schedule.medicineName?.medicineName || "Unknown",
          takenCount,
        };
      })
      .filter((item) => item.takenCount > 0); // Only include those with at least one taken

    // Step 2: Find max taken count
    const maxTaken = Math.max(...usageData.map((item) => item.takenCount), 0);

    // Step 3: Calculate percentage relative to max taken
    const finalData = usageData.map((item) => ({
      ...item,
      usagePercentage:
        maxTaken > 0
          ? ((item.takenCount / maxTaken) * 100).toFixed(2) + "%"
          : "0.00%",
    }));

    // Step 4: Sort descending
    finalData.sort((a, b) => b.takenCount - a.takenCount);

    if (req.user) {
      await activityLogService.createActivity({
        userId: req.user._id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.MEDICINE_USAGES,
        activityCategory: enumConfig.activityCategoryEnum.MEDICINE_USAGES,
        description: "Top used medicines fetched successfully",
        status: enumConfig.activityStatusEnum.SUCCESS,
      });
    }

    return apiResponse({
      res,
      status: true,
      data: finalData,
      message: "Top used medicines fetched successfully",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.error("Error calculating medicine usage:", error);
    if (req.user) {
      await activityLogService.createActivity({
        userId: req.user._id,
        userRole: Array.isArray(req.user.role)
          ? req.user.role
          : [req.user.role],
        activityType: enumConfig.activityTypeEnum.MEDICINE_USAGES,
        activityCategory: enumConfig.activityCategoryEnum.MEDICINE_USAGES,
        description: error.message || "Server error.",
        status: enumConfig.activityStatusEnum.ERROR,
      });
    }

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json(apiResponse(false, null, "Server error"));
  }
};

export default {
  getMedicineUsage,
};
