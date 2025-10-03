import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import axios from "axios";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";

const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

const getCurrentWeather = async (req, res) => {
  try {
    // accept city from body OR query OR route param
    const city = (req.body?.city ?? req.query?.city ?? req.params?.city ?? "")
      .toString()
      .trim();

    // optional overrides (fallbacks provided)
    const unitsRaw = (
      req.body?.units ??
      req.query?.units ??
      "metric"
    ).toString();
    const lang = (req.body?.lang ?? req.query?.lang ?? "en").toString();
    const allowedUnits = ["metric", "imperial", "standard"];
    const units = allowedUnits.includes(unitsRaw) ? unitsRaw : "metric";

    if (!process.env.OPENWEATHER_API_KEY) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        message: "Weather service not configured: missing OPENWEATHER_API_KEY.",
        data: null,
      });
    }

    if (!city) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Please provide city name. Example: Surat or Surat,IN",
        data: null,
      });
    }

    // Build request (city only)
    const params = {
      appid: process.env.OPENWEATHER_API_KEY,
      q: city, // e.g. "Surat" or "Surat,IN"
      units, // default metric
      lang, // default en
    };

    const owRes = await axios.get(OPENWEATHER_BASE_URL, {
      params,
      timeout: 10000,
    });
    const d = owRes.data;

    const payload = {
      location: {
        name: d?.name ?? null,
        country: d?.sys?.country ?? null,
        coord: d?.coord ?? null,
        timezoneOffsetSec: d?.timezone ?? null,
        query: city,
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
      requested: { city, units, lang },
    };

    // optional activity log (best effort)
    try {
      await activityLogService.createActivity({
        userId: req.user?._id,
        userRole: Array.isArray(req.user?.role)
          ? req.user.role
          : [req.user?.role].filter(Boolean),
        activityType:
          enumConfig?.activityTypeEnum?.WEATHER?.FETCH ?? "Fetch Weather",
        activityCategory: enumConfig?.activityCategoryEnum?.WEATHER,
        description: `Weather fetched for city=${city}`,
        status: enumConfig?.activityStatusEnum?.SUCCESS ?? "SUCCESS",
      });
    } catch (_) {}

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Weather fetched successfully.",
      data: payload,
    });
  } catch (error) {
    console.log(error);

    const status = error?.response?.status;
    let message = "Failed to fetch weather.";
    if (status === 401) message = "Invalid OpenWeather API key.";
    else if (status === 404) message = "City not found.";
    else if (status === 429) message = "Rate limit exceeded. Try again later.";
    else if (status >= 500)
      message = "Weather provider unavailable. Try again later.";

    try {
      await activityLogService.createActivity({
        userId: req.user?._id,
        userRole: Array.isArray(req.user?.role)
          ? req.user.role
          : [req.user?.role].filter(Boolean),
        activityType:
          enumConfig?.activityTypeEnum?.WEATHER?.FETCH ?? "Weather Fetch",
        activityCategory: enumConfig?.activityCategoryEnum.WEATHER,
        description: `Weather fetch failed for city=${
          (req.body?.city ?? req.query?.city ?? req.params?.city) || ""
        }: ${message}`,
        status: enumConfig.activityStatusEnum.ERROR,
      });
    } catch (_) {}

    return apiResponse({
      res,
      status: false,
      statusCode: status || StatusCodes.INTERNAL_SERVER_ERROR,
      message,
      data: error?.response?.data ?? null,
    });
  }
};

export default { getCurrentWeather };
