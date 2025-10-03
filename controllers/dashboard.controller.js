import moment from "moment";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import UserModel from "../models/user.model.js";
import enumConfig from "../config/enum.config.js";
import Telemedicine from "../models/telemedicine.model.js";
import MedicineScheduleModel from "../models/medicine.schedual.model.js";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import Medicine from "../models/medicine.model.js";
import activityLogService from "../services/activity-log.service.js";
import SupplementViewLog from "../models/supplement-view-log.model.js";
import AiQueryLog from "../models/aiQuery-log.model.js";
import ActivityLog from "../models/activity-log.model.js";
import SupplementModel from "../models/supplements.model.js";
import HealthGoalModel from "../models/healthGoal.model.js";
import Onboarding from "../models/onboarding.model.js";
import axios from "axios";
import MentalHealth from "../models/mentalhealth.assessment.schema.js";
import FeatureFlagModel from "../models/feature-flags.model.js";

const S = enumConfig.appointmentStatusEnums;

const parseDdMmYyyyOrNull = (str) => {
  const m = moment(str, "DD/MM/YYYY", true);
  return m.isValid() ? m : null;
};

const generateMonthlyScheduleReport = async (userId, date = new Date()) => {
  const year = date.getUTCFullYear();
  const month1based = date.getUTCMonth() + 1;
  const month0 = month1based - 1;

  const monthStart = new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59, 999));

  const TAKEN_SET = new Set(
    [
      enumConfig?.scheduleStatusEnums?.TAKEN,
      enumConfig?.scheduleStatusEnums?.COMPLETED,
      enumConfig?.scheduleStatusEnums?.DONE,
      "TAKEN",
      "COMPLETED",
      "DONE",
    ].filter(Boolean)
  );

  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const weekRange = (w) => {
    const startDay = (w - 1) * 7 + 1;
    const endDay = Math.min(startDay + 6, lastDay);
    return {
      start: new Date(Date.UTC(year, month0, startDay, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month0, endDay, 23, 59, 59, 999)),
    };
  };
  const weekOfMonth = (date) =>
    Math.min(5, Math.ceil(new Date(date).getUTCDate() / 7));

  const weekStats = {
    1: { taken: 0, total: 0 },
    2: { taken: 0, total: 0 },
    3: { taken: 0, total: 0 },
    4: { taken: 0, total: 0 },
    5: { taken: 0, total: 0 },
  };

  const schedules = await MedicineScheduleModel.find({
    userId,
    $or: [
      {
        $and: [
          { startDate: { $lte: monthEnd } },
          { endDate: { $gte: monthStart } },
        ],
      },
      {
        $and: [
          { startDate: { $lte: monthEnd } },
          { endDate: { $exists: false } },
        ],
      },
      {
        $and: [
          { startDate: { $exists: false } },
          { endDate: { $exists: false } },
        ],
      },
    ],
  })
    .select("doseLogs medicineName dosage totalDosesPerDay")
    .lean();

  for (const sch of schedules) {
    const logs = Array.isArray(sch.doseLogs) ? sch.doseLogs : [];
    for (const daily of logs) {
      const d = daily?.date;
      if (!d) continue;
      const dt = new Date(d);
      if (dt < monthStart || dt > monthEnd) continue;
      const wb = weekOfMonth(dt);
      const entries = Array.isArray(daily.doses) ? daily.doses : [];
      weekStats[wb].total += entries.length;
      for (const e of entries) {
        const statusVal = e?.status;
        if (statusVal && TAKEN_SET.has(statusVal)) {
          weekStats[wb].taken += 1;
        }
      }
    }
  }

  const toPercent = (t, n) => (n > 0 ? Math.round((t / n) * 100) : 0);
  const weeks = [1, 2, 3, 4, 5].map((w) => {
    const r = weekRange(w);
    const { taken, total } = weekStats[w];
    return {
      week: `${w} Week`,
      startDate: r.start.toISOString(),
      endDate: r.end.toISOString(),
      taken,
      total,
      adherencePercent: toPercent(taken, total),
    };
  });

  const totals = Object.values(weekStats).reduce(
    (acc, w) => ({ taken: acc.taken + w.taken, total: acc.total + w.total }),
    { taken: 0, total: 0 }
  );

  return {
    month: `${year}-${String(month1based).padStart(2, "0")}`,
    range: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
    overview: {
      totalTaken: totals.taken,
      totalDoses: totals.total,
      adherencePercent: toPercent(totals.taken, totals.total),
    },
    weeks,
  };
};

const getDashboard = async (req, res) => {
  try {
    const role = req.user.role;
    const loginUserId = req.user._id;

    const todayStart = moment().startOf("day").toDate();
    const todayEnd = moment().endOf("day").toDate();

    // ================= ADMIN DASHBOARD =================
    if (
      role?.includes(enumConfig.userRoleEnum.ADMIN) ||
      role?.includes(enumConfig.userRoleEnum.SUPERADMIN)
    ) {
      // --- Existing Counts ---
      const countActiveUsers = await UserModel.countDocuments({
        role: { $in: [enumConfig.userRoleEnum.USER] },
        is_deleted: false,
        is_verified: true,
      });

      const countInActiveUsers = await UserModel.countDocuments({
        role: { $in: [enumConfig.userRoleEnum.USER] },
        is_deleted: true,
      });

      const totalUsers = countActiveUsers + countInActiveUsers;

      const totalActiveCaregivers = await UserModel.countDocuments({
        role: { $in: [enumConfig.userRoleEnum.CAREGIVER] },
        is_deleted: false,
      });

      const totalDoctors = await UserModel.countDocuments({
        role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
        is_deleted: false,
      });

      const todaysDoctorAppointments = await Telemedicine.find({
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
      })
        .populate("doctorId", "fullName email")
        .populate("userId", "fullName");

      const totalAppointments = await Telemedicine.countDocuments({});
      const totalMedicines = await Medicine.countDocuments({});
      const totalSupplements = await SupplementModel.countDocuments({});

      // --- Dashboard Logs ---
      const [topViewed, queryTrends, modelBreakdown, rawActivityStats] =
        await Promise.all([
          // ✅ Top Viewed Supplements
          SupplementViewLog.aggregate([
            {
              $group: {
                _id: "$supplementId",
                views: { $sum: 1 },
              },
            },
            { $sort: { views: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: "supplements",
                localField: "_id",
                foreignField: "_id",
                as: "supplementData",
              },
            },
            { $unwind: "$supplementData" },
            {
              $project: {
                _id: 0,
                supplementId: "$_id",
                views: 1,
                productName: "$supplementData.productName",
                brandName: "$supplementData.brandName",
                description: "$supplementData.description",
                isAvailable: "$supplementData.isAvailable",
              },
            },
          ]),

          // ✅ AI Queries by Date
          AiQueryLog.aggregate([
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ]),

          // ✅ AI Model Breakdown
          AiQueryLog.aggregate([
            { $group: { _id: "$model", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ]),

          // ✅ Activity Logs Summary
          ActivityLog.aggregate([
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ]),
        ]);

      // ✅ Ensure all statuses are returned with count = 0 if missing
      const allStatuses = [
        enumConfig.activityStatusEnum.INFO,
        enumConfig.activityStatusEnum.WARNING,
        enumConfig.activityStatusEnum.ERROR,
        enumConfig.activityStatusEnum.SUCCESS,
        enumConfig.activityStatusEnum.FAILED,
      ];

      const activityLogsSummary = allStatuses.map((status) => {
        const found = rawActivityStats.find((item) => item._id === status);
        return {
          status,
          count: found ? found.count : 0,
        };
      });

      let dashboardType = "";
      let message = "";

      // Role check
      if (role?.includes(enumConfig.userRoleEnum.ADMIN)) {
        dashboardType = "Admin";
        message = `${dashboardType} dashboard data fetched successfully`;
      } else if (role?.includes(enumConfig.userRoleEnum.SUPERADMIN)) {
        dashboardType = "Superadmin";
        message = `${dashboardType} dashboard data fetched successfully`;
      }

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message,
        data: {
          totalUsers,
          countActiveUsers,
          countInActiveUsers,
          totalActiveCaregivers,
          totalDoctors,
          totalAppointments,
          totalMedicines,
          totalSupplements,
          todaysDoctorAppointments,
          topViewedSupplements: topViewed || [],
          aiQueriesByDate: queryTrends || [],
          aiModelBreakdown: modelBreakdown || [],
          activityLogsSummary,
        },
      });
    }

    // ================= USER DASHBOARD =================
    if (role?.includes(enumConfig.userRoleEnum.USER)) {
      const OPENWEATHER_BASE_URL =
        "https://api.openweathermap.org/data/2.5/weather";

      const [
        userInfo,
        healthData,
        onboardData,
        medicineSchedule,
        vaccineSchedule,
        appointmentSchedule,
        supplements,
        monthlyScheduleReport, // added
        mentalHealthScore,
        featureFlags,
      ] = await Promise.all([
        UserModel.findOne({
          _id: loginUserId,
          is_verified: true,
          is_deleted: false,
        }).select("email fullName profileImage role is_caregiver_block"),
        HealthGoalModel.findOne({ userId: loginUserId }).select(
          "-_id -userId -createdAt -updatedAt"
        ),
        Onboarding.findOne({ userId: loginUserId }).select(
          "-_id -userId -createdAt -updatedAt -__v -perspective"
        ),
        MedicineScheduleModel.find({
          userId: loginUserId,
          startDate: { $lte: todayEnd },
          endDate: { $gte: todayStart },
        }).populate("medicineName", "medicineName dosage"),
        VaccineSchedule.find({
          scheduleBy: loginUserId,
          date: { $gte: todayStart, $lte: todayEnd },
        }).populate("vaccineId", "vaccineName provider"),
        Telemedicine.find({
          userId: loginUserId,
          appointmentDate: { $gte: todayStart, $lte: todayEnd },
        }).populate("doctorId", "fullName profileImage"),
        SupplementModel.find()
          .populate("ingredients", "name categories description")
          .populate("tags", "name category color")
          .sort({ createdAt: -1 })
          .limit(5),
        generateMonthlyScheduleReport(loginUserId),
        MentalHealth.find({ userId: loginUserId }).select(
          "advice level percentage"
        ),
        FeatureFlagModel.find().select("key value").sort({ createdAt: -1 }),
      ]);

      // ✅ Fetch weather using onboarding city
      let weatherData = null;
      try {
        console.log(onboardData?.city);
        console.log(process.env.OPENWEATHER_API_KEY);

        if (onboardData?.city && process.env.OPENWEATHER_API_KEY) {
          const owRes = await axios.get(OPENWEATHER_BASE_URL, {
            params: {
              appid: process.env.OPENWEATHER_API_KEY,
              q: onboardData.city, // user’s onboard city
              units: "metric",
              lang: "en",
            },
            timeout: 10000,
          });
          const d = owRes.data;
          weatherData = {
            location: {
              name: d?.name ?? null,
              country: d?.sys?.country ?? null,
              coord: d?.coord ?? null,
              timezoneOffsetSec: d?.timezone ?? null,
              query: onboardData.city,
            },
            weather: {
              main: d?.weather?.[0]?.main ?? null,
              description: d?.weather?.[0]?.description ?? null,
              icon: d?.weather?.[0]?.icon ?? null,
            },
            temperature: {
              current: d?.main?.temp ?? null,
              feels_like: d?.main?.feels_like ?? null,
              min: d?.main?.temp_min ?? null,
              max: d?.main?.temp_max ?? null,
              humidity: d?.main?.humidity ?? null,
              pressure: d?.main?.pressure ?? null,
            },
            wind: {
              speed: d?.wind?.speed ?? null,
              deg: d?.wind?.deg ?? null,
              gust: d?.wind?.gust ?? null,
            },
            cloudsPercent: d?.clouds?.all ?? null,
            visibility: d?.visibility ?? null,
            sunrise: d?.sys?.sunrise
              ? new Date(d.sys.sunrise * 1000).toISOString()
              : null,
            sunset: d?.sys?.sunset
              ? new Date(d.sys.sunset * 1000).toISOString()
              : null,
          };
        }
      } catch (err) {
        console.log("Weather fetch failed:", err?.message || err);
        weatherData = null;
      }

      const today = moment().format("YYYY-MM-DD");
      const formattedMedicineSchedule = [];

      for (const schedule of medicineSchedule) {
        const todayLog = schedule.doseLogs?.find(
          (log) => moment(log.date).format("YYYY-MM-DD") === today
        );

        if (todayLog && schedule.medicineName) {
          for (const dose of todayLog.doses) {
            formattedMedicineSchedule.push({
              scheduleId: schedule._id,
              medicineName: schedule.medicineName.medicineName,
              dosage: schedule.medicineName.dosage,
              date: todayLog.date,
              doses: {
                time: dose.time,
                status: dose.status,
                note:
                  dose.status === "missed"
                    ? "You missed this dose. Please take it as soon as possible."
                    : schedule.medicineName.description || "undefined",
              },
            });
          }
        }
      }

      // Sort by time (like reference API)
      formattedMedicineSchedule.sort((a, b) => {
        const timeA = moment(a.doses.time, ["hh:mm A"]).toDate();
        const timeB = moment(b.doses.time, ["hh:mm A"]).toDate();
        return timeA - timeB;
      });

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message: "Dashboard data fetched successfully",
        data: {
          userInfo,
          healthData,
          onboardData,
          medicineSchedule: formattedMedicineSchedule,
          vaccineSchedule,
          appointmentSchedule,
          supplements,
          monthlyScheduleReport,
          weather: weatherData,
          mentalHealthScore: mentalHealthScore[0] || null,
          featureFlags,
        },
      });
    }

    // ================= DOCTOR DASHBOARD =================
    if (role?.includes(enumConfig.userRoleEnum.DOCTOR)) {
      const doctorId = new mongoose.Types.ObjectId(loginUserId);

      const doctorInfo = await UserModel.findOne({
        _id: loginUserId,
        is_verified: true,
        is_deleted: false,
      }).select(
        "email fullName experience phoneNumber profileImage role description specialization qualifications"
      );

      const topMedicines = await MedicineScheduleModel.find()
        .populate(
          "medicineName",
          "medicineName dosage description takenForSymptoms associatedRisks expDate"
        )
        .select("medicineName dosage quantity")
        .limit(6)
        .sort({ createdAt: -1 });

      const todaysDoctorAppointments = await Telemedicine.find({
        doctorId,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
      })
        .populate("doctorId", "fullName email")
        .populate("userId", "fullName profileImage email");

      // ✅ collect all userIds from today's appointments
      const userIds = todaysDoctorAppointments
        .map((appt) => appt.userId?._id)
        .filter(Boolean);

      // ✅ fetch related data in parallel
      let [
        healthDataList,
        onboardDataList,
        medicineSchedulesList,
        vaccineSchedulesList,
      ] = await Promise.all([
        HealthGoalModel.find({ userId: { $in: userIds } }).select(
          "-createdAt -updatedAt -__v"
        ),
        Onboarding.find({ userId: { $in: userIds } }).select(
          "-createdAt -updatedAt -__v -perspective"
        ),
        MedicineScheduleModel.find({
          userId: { $in: userIds },
          startDate: { $lte: todayEnd },
          endDate: { $gte: todayStart },
        })
          .populate("medicineName", "medicineName dosage")
          .lean(),
        VaccineSchedule.find({
          scheduleBy: { $in: userIds },
          date: { $gte: todayStart, $lte: todayEnd },
        })
          .populate("vaccineId", "vaccineName provider")
          .select("-createdAt -updatedAt -__v -isReminderSent")
          .lean(),
      ]);

      // ✅ filter medicineSchedules doseLogs for today
      const todayStr = moment().format("YYYY-MM-DD");
      medicineSchedulesList = medicineSchedulesList.map((s) => ({
        ...s,
        doseLogs: (s.doseLogs || []).filter(
          (log) => moment(log.date).format("YYYY-MM-DD") === todayStr
        ),
      }));

      vaccineSchedulesList = vaccineSchedulesList
        .filter((vs) => moment(vs.date).format("YYYY-MM-DD") === todayStr)
        .map((vs) => {
          const dateTime = moment(
            moment(vs.date).format("YYYY-MM-DD") + " " + vs.doseTime,
            "YYYY-MM-DD hh:mm A"
          ).toDate();
          return { ...vs, scheduledDateTime: dateTime };
        });

      // ✅ make maps for quick lookup
      const healthMap = new Map(
        healthDataList.map((h) => [h.userId.toString(), h])
      );
      const onboardMap = new Map(
        onboardDataList.map((o) => [o.userId.toString(), o])
      );
      const medicineMap = new Map();
      const vaccineMap = new Map();

      // group medicineSchedules by userId
      for (const ms of medicineSchedulesList) {
        const uid = ms.userId.toString();
        if (!medicineMap.has(uid)) {
          medicineMap.set(uid, []);
        }
        medicineMap.get(uid).push(ms);
      }

      // group vaccineSchedules by userId
      for (const vs of vaccineSchedulesList) {
        const uid = vs.scheduleBy.toString();
        if (!vaccineMap.has(uid)) {
          vaccineMap.set(uid, []);
        }
        vaccineMap.get(uid).push(vs);
      }

      // ✅ patientName filter
      const patientName = (req.query.patientName || "").trim();

      let filteredAppointments = todaysDoctorAppointments;
      if (patientName) {
        const regex = new RegExp(patientName, "i"); // case-insensitive search
        filteredAppointments = todaysDoctorAppointments.filter((appt) =>
          regex.test(appt.userId?.fullName || "")
        );
      }

      // ✅ enrich only the filtered list
      const enrichedAppointments = filteredAppointments.map((appt) => {
        const uid = appt.userId?._id?.toString();
        return {
          ...appt.toObject(),
          userId: {
            ...appt.userId.toObject(),
            healthData: healthMap.get(uid) || null,
            onboardData: onboardMap.get(uid) || null,
            medicineSchedules: medicineMap.get(uid) || [],
            vaccineSchedules: vaccineMap.get(uid) || [],
          },
        };
      });

      // -------- NEW: Month calendar + per-day details --------
      // Inputs
      const qMonth = Number(req.query.month);
      const qYear = Number(req.query.year);
      const qDate = (req.query.date || "").trim();

      const now = moment();
      const month =
        Number.isInteger(qMonth) && qMonth >= 1 && qMonth <= 12
          ? qMonth
          : now.month() + 1;
      const year =
        Number.isInteger(qYear) && qYear >= 1970 ? qYear : now.year();

      const monthStart = moment({ year, month: month - 1, day: 1 }).startOf(
        "month"
      );
      const monthEnd = moment({ year, month: month - 1, day: 1 }).endOf(
        "month"
      );

      const monthStartDate = monthStart.toDate();
      const monthEndDate = monthEnd.toDate();

      // Aggregate counts per day per status
      const calendarAgg = await Telemedicine.aggregate([
        {
          $match: {
            doctorId,
            appointmentDate: { $gte: monthStartDate, $lte: monthEndDate },
          },
        },
        {
          $project: {
            dayKey: {
              $dateToString: { format: "%Y-%m-%d", date: "$appointmentDate" },
            },
            status: 1,
          },
        },
        {
          $group: {
            _id: "$dayKey",
            scheduled: {
              $sum: { $cond: [{ $eq: ["$status", S.SCHEDULED] }, 1, 0] },
            },
            confirm: {
              $sum: { $cond: [{ $eq: ["$status", S.CONFIRM] }, 1, 0] },
            },
            started: {
              $sum: { $cond: [{ $eq: ["$status", S.STARTED] }, 1, 0] },
            },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", S.COMPLETED] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ["$status", S.CANCELLED] }, 1, 0] },
            },
            missed: { $sum: { $cond: [{ $eq: ["$status", S.MISSED] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: "$_id",
            counts: {
              scheduled: { $ifNull: ["$scheduled", 0] },
              confirm: { $ifNull: ["$confirm", 0] },
              started: { $ifNull: ["$started", 0] },
              completed: { $ifNull: ["$completed", 0] },
              cancelled: { $ifNull: ["$cancelled", 0] },
              missed: { $ifNull: ["$missed", 0] },
              total: {
                $add: [
                  { $ifNull: ["$scheduled", 0] },
                  { $ifNull: ["$confirm", 0] },
                  { $ifNull: ["$started", 0] },
                  { $ifNull: ["$completed", 0] },
                  { $ifNull: ["$cancelled", 0] },
                  { $ifNull: ["$missed", 0] },
                ],
              },
            },
          },
        },
      ]);

      // Normalize to include every day (with zeros)
      const allDays = [];
      for (
        let d = moment(monthStart);
        d.isSameOrBefore(monthEnd, "day");
        d.add(1, "day")
      ) {
        allDays.push(d.format("YYYY-MM-DD"));
      }
      const map = new Map(calendarAgg.map((r) => [r.date, r.counts]));
      const calendar = allDays.map((iso) => ({
        date: iso,
        counts: map.get(iso) || {
          scheduled: 0,
          confirm: 0,
          started: 0,
          completed: 0,
          cancelled: 0,
          missed: 0,
          total: 0,
        },
      }));

      // Optional: day list by dd/mm/yyyy
      let appointmentsForDate = [];
      if (qDate) {
        const parsed = moment(qDate);

        if (!parsed.isValid()) {
          return apiResponse({
            res,
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Invalid date. Use valid ISO format",
            data: null,
          });
        }

        const dayStart = parsed.startOf("day").toDate();
        const dayEnd = parsed.endOf("day").toDate();

        appointmentsForDate = await Telemedicine.find({
          doctorId,
          appointmentDate: { $gte: dayStart, $lte: dayEnd },
        })
          .select(
            "appointmentDate status meetingLink notes reasonForAppointment"
          )
          .populate("userId", "fullName profileImage")
          .sort({ appointmentDate: 1 });
      }

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message: "Doctor dashboard data fetched successfully",
        data: {
          doctorInfo,
          mostPrescribedMedicine: topMedicines || [],
          todaysDoctorAppointments: enrichedAppointments || [],
          calendarContext: { month, year },
          calendar,
          appointmentsForDate,
        },
      });
    }

    return apiResponse({
      res,
      statusCode: StatusCodes.FORBIDDEN,
      status: false,
      message: "Unauthorized role",
      data: null,
    });
  } catch (error) {
    console.log(error);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.ADMIN.GET_DASHBOARD,
      activityCategory: enumConfig.activityCategoryEnum.DASHBOARD,
      description: error.message || "Failed to fetch dashboard data.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
      data: null,
    });
  }
};

export const socketForGetDashboard = (io, socket) => {
  /**
   * Client emits:
   * socket.emit("dashboard:get", { month, year, date, patientName })
   */
  socket.on("dashboard:get", async (payload = {}) => {
    try {
      const role = socket?.user?.role;
      const loginUserId = socket?.user?._id;

      const todayStart = moment().startOf("day").toDate();
      const todayEnd = moment().endOf("day").toDate();

      if (!role || !loginUserId) {
        return socket.emit(
          "dashboard:get:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.UNAUTHORIZED,
            message: "Unauthorized access.",
          })
        );
      }

      // Ensure user exists with this role
      const isExist = await UserModel.findOne({
        _id: loginUserId,
        is_deleted: false,
        role,
      });
      if (!isExist) {
        return socket.emit(
          "dashboard:get:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.NOT_FOUND,
            message: `${role} not found.`,
          })
        );
      }

      // =================== ADMIN DASHBOARD ===================
      if (role?.includes(enumConfig.userRoleEnum.ADMIN)) {
        const [
          countActiveUsers,
          countInActiveUsers,
          totalActiveCaregivers,
          totalDoctors,
          todaysDoctorAppointments,
          totalAppointments,
          totalMedicines,
          totalSupplements,
          // Logs & analytics (keep parity with HTTP API)
          topViewed,
          queryTrends,
          modelBreakdown,
          rawActivityStats,
        ] = await Promise.all([
          // Active users
          UserModel.countDocuments({
            role: { $in: [enumConfig.userRoleEnum.USER] },
            is_deleted: false,
            is_verified: true,
          }),
          // Inactive users
          UserModel.countDocuments({
            role: { $in: [enumConfig.userRoleEnum.USER] },
            is_deleted: true,
          }),
          // Caregivers
          UserModel.countDocuments({
            role: { $in: [enumConfig.userRoleEnum.CAREGIVER] },
            is_deleted: false,
          }),
          // Doctors
          UserModel.countDocuments({
            role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
            is_deleted: false,
          }),
          // Today's doctor appts (all doctors)
          Telemedicine.find({
            appointmentDate: { $gte: todayStart, $lte: todayEnd },
          })
            .populate("doctorId", "fullName email")
            .populate("userId", "fullName"),
          // Totals
          Telemedicine.countDocuments({}),
          Medicine.countDocuments({}),
          SupplementModel.countDocuments({}),

          // ===== Dashboard Logs =====
          // Top Viewed Supplements
          SupplementViewLog.aggregate([
            {
              $group: {
                _id: "$supplementId",
                views: { $sum: 1 },
              },
            },
            { $sort: { views: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: "supplements",
                localField: "_id",
                foreignField: "_id",
                as: "supplementData",
              },
            },
            { $unwind: "$supplementData" },
            {
              $project: {
                _id: 0,
                supplementId: "$_id",
                views: 1,
                productName: "$supplementData.productName",
                brandName: "$supplementData.brandName",
                description: "$supplementData.description",
                isAvailable: "$supplementData.isAvailable",
              },
            },
          ]),

          // AI Queries by Date
          AiQueryLog.aggregate([
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ]),

          // AI Model Breakdown
          AiQueryLog.aggregate([
            { $group: { _id: "$model", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ]),

          // Activity Logs Summary
          ActivityLog.aggregate([
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ]),
        ]);

        // Ensure all statuses appear with 0
        const allStatuses = [
          enumConfig.activityStatusEnum.INFO,
          enumConfig.activityStatusEnum.WARNING,
          enumConfig.activityStatusEnum.ERROR,
          enumConfig.activityStatusEnum.SUCCESS,
          enumConfig.activityStatusEnum.FAILED,
        ];
        const activityLogsSummary = allStatuses.map((status) => {
          const found = rawActivityStats.find((i) => i._id === status);
          return { status, count: found ? found.count : 0 };
        });

        return socket.emit(
          "dashboard:get:success",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            message: "Admin dashboard data fetched successfully",
            data: {
              totalUsers: countActiveUsers + countInActiveUsers,
              countActiveUsers,
              countInActiveUsers,
              totalActiveCaregivers,
              totalDoctors,
              totalAppointments,
              totalMedicines,
              totalSupplements,
              todaysDoctorAppointments,
              topViewedSupplements: topViewed || [],
              aiQueriesByDate: queryTrends || [],
              aiModelBreakdown: modelBreakdown || [],
              activityLogsSummary,
            },
          })
        );
      }

      // =================== USER DASHBOARD ===================
      if (role?.includes(enumConfig.userRoleEnum.USER)) {
        const [
          userInfo,
          healthData,
          onboardData,
          medicineSchedule,
          vaccineSchedule,
          appointmentSchedule,
        ] = await Promise.all([
          UserModel.findOne({
            _id: loginUserId,
            is_verified: true,
            is_deleted: false,
          }).select("email fullName profileImage role"),
          HealthGoalModel.findOne({ userId: loginUserId }).select(
            "-_id -userId -createdAt -updatedAt"
          ),
          Onboarding.findOne({ userId: loginUserId }).select(
            "-_id -userId -createdAt -updatedAt -__v -perspective"
          ),
          MedicineScheduleModel.find({
            userId: loginUserId,
            startDate: { $lte: todayEnd },
            endDate: { $gte: todayStart },
          }).populate("medicineName", "medicineName dosage"),
          // NOTE: parity with HTTP API — VaccineSchedule queried by scheduleBy
          VaccineSchedule.find({
            scheduleBy: loginUserId,
            date: { $gte: todayStart, $lte: todayEnd },
          }).populate("vaccineId", "vaccineName provider"),
          Telemedicine.find({
            userId: loginUserId,
            appointmentDate: { $gte: todayStart, $lte: todayEnd },
          }).populate("doctorId", "fullName profileImage"),
        ]);

        return socket.emit(
          "dashboard:get:success",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            message: "Dashboard data fetched successfully",
            data: {
              userInfo,
              healthData,
              onboardData,
              medicineSchedule,
              vaccineSchedule,
              appointmentSchedule,
            },
          })
        );
      }

      // =================== DOCTOR DASHBOARD ===================
      if (role?.includes(enumConfig.userRoleEnum.DOCTOR)) {
        const doctorId = new mongoose.Types.ObjectId(loginUserId);

        // Doctor profile
        const doctorInfo = await UserModel.findOne({
          _id: loginUserId,
          is_verified: true,
          is_deleted: false,
        }).select(
          "email fullName experience phoneNumber profileImage role description specialization qualifications"
        );

        // Last 6 medicine schedules (like HTTP version)
        const topMedicines = await MedicineScheduleModel.find()
          .populate(
            "medicineName",
            "medicineName dosage description takenForSymptoms associatedRisks expDate"
          )
          .select("medicineName dosage quantity")
          .limit(6)
          .sort({ createdAt: -1 });

        // Today’s appts for this doctor (full populate)
        const todaysDoctorAppointments = await Telemedicine.find({
          doctorId,
          appointmentDate: { $gte: todayStart, $lte: todayEnd },
        })
          .populate("doctorId", "fullName email")
          .populate("userId", "fullName profileImage email");

        // Collect today’s patients’ userIds
        const userIds = todaysDoctorAppointments
          .map((appt) => appt.userId?._id)
          .filter(Boolean);

        // Fetch related data in parallel
        let [
          healthDataList,
          onboardDataList,
          medicineSchedulesList,
          vaccineSchedulesList,
        ] = await Promise.all([
          HealthGoalModel.find({ userId: { $in: userIds } }).select(
            "-createdAt -updatedAt -__v"
          ),
          Onboarding.find({ userId: { $in: userIds } }).select(
            "-createdAt -updatedAt -__v -perspective"
          ),
          MedicineScheduleModel.find({
            userId: { $in: userIds },
            startDate: { $lte: todayEnd },
            endDate: { $gte: todayStart },
          })
            .populate("medicineName", "medicineName dosage")
            .lean(),
          VaccineSchedule.find({
            scheduleBy: { $in: userIds },
            date: { $gte: todayStart, $lte: todayEnd },
          })
            .populate("vaccineId", "vaccineName provider")
            .select("-createdAt -updatedAt -__v -isReminderSent")
            .lean(),
        ]);

        // Filter doseLogs of medicine schedules to only today
        const todayStr = moment().format("YYYY-MM-DD");
        medicineSchedulesList = medicineSchedulesList.map((s) => ({
          ...s,
          doseLogs: (s.doseLogs || []).filter(
            (log) => moment(log.date).format("YYYY-MM-DD") === todayStr
          ),
        }));

        // Only keep today’s vaccine schedules; add scheduledDateTime
        vaccineSchedulesList = vaccineSchedulesList
          .filter((vs) => moment(vs.date).format("YYYY-MM-DD") === todayStr)
          .map((vs) => {
            const dateTime = moment(
              moment(vs.date).format("YYYY-MM-DD") + " " + vs.doseTime,
              "YYYY-MM-DD hh:mm A"
            ).toDate();
            return { ...vs, scheduledDateTime: dateTime };
          });

        // Build maps for enrichment
        const healthMap = new Map(
          healthDataList.map((h) => [h.userId.toString(), h])
        );
        const onboardMap = new Map(
          onboardDataList.map((o) => [o.userId.toString(), o])
        );
        const medicineMap = new Map();
        const vaccineMap = new Map();

        for (const ms of medicineSchedulesList) {
          const uid = ms.userId.toString();
          if (!medicineMap.has(uid)) medicineMap.set(uid, []);
          medicineMap.get(uid).push(ms);
        }

        for (const vs of vaccineSchedulesList) {
          const uid = vs.scheduleBy.toString();
          if (!vaccineMap.has(uid)) vaccineMap.set(uid, []);
          vaccineMap.get(uid).push(vs);
        }

        // Optional filter: patientName (from payload)
        const patientName = (payload.patientName || "").trim();
        let filteredAppointments = todaysDoctorAppointments;
        if (patientName) {
          const regex = new RegExp(patientName, "i");
          filteredAppointments = todaysDoctorAppointments.filter((appt) =>
            regex.test(appt.userId?.fullName || "")
          );
        }

        // Enrich filtered appointments
        const enrichedAppointments = filteredAppointments.map((appt) => {
          const uid = appt.userId?._id?.toString();
          return {
            ...appt.toObject(),
            userId: {
              ...appt.userId.toObject(),
              healthData: healthMap.get(uid) || null,
              onboardData: onboardMap.get(uid) || null,
              medicineSchedules: medicineMap.get(uid) || [],
              vaccineSchedules: vaccineMap.get(uid) || [],
            },
          };
        });

        // -------- Month calendar + per-day details --------
        const now = moment();
        const qMonth = Number(payload.month);
        const qYear = Number(payload.year);
        const qDate = (payload.date || "").trim(); // ISO or dd/mm/yyyy? (we’ll accept ISO here; see below)

        const month =
          Number.isInteger(qMonth) && qMonth >= 1 && qMonth <= 12
            ? qMonth
            : now.month() + 1;
        const year =
          Number.isInteger(qYear) && qYear >= 1970 ? qYear : now.year();

        const monthStart = moment({ year, month: month - 1, day: 1 }).startOf(
          "month"
        );
        const monthEnd = moment({ year, month: month - 1, day: 1 }).endOf(
          "month"
        );

        const monthStartDate = monthStart.toDate();
        const monthEndDate = monthEnd.toDate();

        const calendarAgg = await Telemedicine.aggregate([
          {
            $match: {
              doctorId,
              appointmentDate: { $gte: monthStartDate, $lte: monthEndDate },
            },
          },
          {
            $project: {
              dayKey: {
                $dateToString: { format: "%Y-%m-%d", date: "$appointmentDate" },
              },
              status: 1,
            },
          },
          {
            $group: {
              _id: "$dayKey",
              scheduled: {
                $sum: { $cond: [{ $eq: ["$status", S.SCHEDULED] }, 1, 0] },
              },
              confirm: {
                $sum: { $cond: [{ $eq: ["$status", S.CONFIRM] }, 1, 0] },
              },
              started: {
                $sum: { $cond: [{ $eq: ["$status", S.STARTED] }, 1, 0] },
              },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", S.COMPLETED] }, 1, 0] },
              },
              cancelled: {
                $sum: { $cond: [{ $eq: ["$status", S.CANCELLED] }, 1, 0] },
              },
              missed: {
                $sum: { $cond: [{ $eq: ["$status", S.MISSED] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              date: "$_id",
              counts: {
                scheduled: { $ifNull: ["$scheduled", 0] },
                confirm: { $ifNull: ["$confirm", 0] },
                started: { $ifNull: ["$started", 0] },
                completed: { $ifNull: ["$completed", 0] },
                cancelled: { $ifNull: ["$cancelled", 0] },
                missed: { $ifNull: ["$missed", 0] },
                total: {
                  $add: [
                    { $ifNull: ["$scheduled", 0] },
                    { $ifNull: ["$confirm", 0] },
                    { $ifNull: ["$started", 0] },
                    { $ifNull: ["$completed", 0] },
                    { $ifNull: ["$cancelled", 0] },
                    { $ifNull: ["$missed", 0] },
                  ],
                },
              },
            },
          },
        ]);

        const allDays = [];
        for (
          let d = moment(monthStart);
          d.isSameOrBefore(monthEnd, "day");
          d.add(1, "day")
        ) {
          allDays.push(d.format("YYYY-MM-DD"));
        }
        const aggMap = new Map(calendarAgg.map((r) => [r.date, r.counts]));
        const calendar = allDays.map((iso) => ({
          date: iso,
          counts: aggMap.get(iso) || {
            scheduled: 0,
            confirm: 0,
            started: 0,
            completed: 0,
            cancelled: 0,
            missed: 0,
            total: 0,
          },
        }));

        // Optional specific day list (accept ISO or dd/mm/yyyy)
        let appointmentsForDate = [];
        if (qDate) {
          // Try ISO first, else dd/mm/yyyy
          let parsed = moment(qDate, moment.ISO_8601, true);
          if (!parsed.isValid()) parsed = parseDdMmYyyyOrNull(qDate);
          if (!parsed) {
            return socket.emit(
              "dashboard:get:error",
              apiResponse({
                status: false,
                statusCode: StatusCodes.BAD_REQUEST,
                message: "Invalid date. Use ISO or dd/mm/yyyy",
              })
            );
          }
          const dayStart = parsed.startOf("day").toDate();
          const dayEnd = parsed.endOf("day").toDate();

          appointmentsForDate = await Telemedicine.find({
            doctorId,
            appointmentDate: { $gte: dayStart, $lte: dayEnd },
          })
            .select(
              "appointmentDate status meetingLink notes reasonForAppointment"
            )
            .populate("userId", "fullName profileImage")
            .sort({ appointmentDate: 1 });
        }

        return socket.emit(
          "dashboard:get:success",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            message: "Doctor dashboard data fetched successfully",
            data: {
              doctorInfo,
              mostPrescribedMedicine: topMedicines || [],
              todaysDoctorAppointments: enrichedAppointments || [],
              calendarContext: { month, year },
              calendar,
              appointmentsForDate,
            },
          })
        );
      }

      // Fallback
      return socket.emit(
        "dashboard:get:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.FORBIDDEN,
          message: "Unauthorized role",
        })
      );
    } catch (error) {
      console.error(error);
      return socket.emit(
        "dashboard:get:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          message: "Internal server error",
        })
      );
    }
  });
};

export default {
  getDashboard,
};
