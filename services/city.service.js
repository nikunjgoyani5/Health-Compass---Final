import { StatusCodes } from "http-status-codes";
import { Country, State, City } from "country-state-city";
import { apiResponse } from "../helper/api-response.helper.js";
import axios from "axios";

// --- Simple in-memory cache (rebuilds after 24h) ---
let ALL_CITIES_CACHE = null;
let ALL_CITIES_CACHE_AT = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function listCitiesOfCountry(iso2) {
  if (!iso2) return [];
  const code = iso2.toUpperCase();

  // Fast path (available in latest country-state-city)
  if (typeof City.getCitiesOfCountry === "function") {
    return City.getCitiesOfCountry(code) || [];
  }

  // Fallback via states (older versions)
  const states = State.getStatesOfCountry(code) || [];
  let out = [];
  for (const s of states) {
    out = out.concat(City.getCitiesOfState(code, s.isoCode) || []);
  }
  return out;
}

function buildAllCities() {
  const countries = Country.getAllCountries() || [];
  let all = [];
  for (const c of countries) {
    const cs = listCitiesOfCountry(c.isoCode);
    // Minimal normalized shape (keep it light)
    all = all.concat(
      cs.map((x) => ({
        name: x.name,
        countryCode: c.isoCode,
        stateCode: x.stateCode || null,
        latitude: x.latitude || null,
        longitude: x.longitude || null,
      }))
    );
  }
  return all;
}

function getAllCitiesCached() {
  const now = Date.now();
  if (ALL_CITIES_CACHE && now - ALL_CITIES_CACHE_AT < CACHE_TTL_MS) {
    return ALL_CITIES_CACHE;
  }
  ALL_CITIES_CACHE = buildAllCities();
  ALL_CITIES_CACHE_AT = now;
  return ALL_CITIES_CACHE;
}

// Helper function to clean city name
function cleanCityName(name) {
  if (!name) return "Unknown Location";
  return name
    .replace(/^city of\s+/i, "")
    .replace(/^town of\s+/i, "")
    .replace(/^village of\s+/i, "")
    .trim();
}

/**
 * GET /api/cities
 * Query:
 *  - country (optional, ISO2 like IN/US) -> country-wise list
 *  - q (optional) -> case-insensitive substring search (global ya country-scoped)
 *  - page (optional, default 1), limit (optional, default 50, max 200)
 *
 * Behavior:
 *  - Agar country NA ho aur q NA ho: global cities list (paginated) return karega.
 *  - Agar q diya hai: search karega (global ya country scope me).
 */
export const searchCities = async (req, res) => {
  try {
    const country = (req.query.country || "").toString().trim(); // e.g. IN
    const q = (req.query.q || "").toString().trim().toLowerCase();
    const pageNum = Math.max(1, parseInt(req.query.page || "1", 10));
    const limNum = Math.min(
      200,
      Math.max(1, parseInt(req.query.limit || "50", 10))
    );

    let source = [];
    if (country) {
      // Country-scoped
      const iso2 = country.toUpperCase();
      const cities = listCitiesOfCountry(iso2);
      source = cities.map((x) => ({
        name: x.name,
        countryCode: iso2,
        stateCode: x.stateCode || null,
        latitude: x.latitude || null,
        longitude: x.longitude || null,
      }));
    } else {
      // Global (no country required)
      source = getAllCitiesCached();
    }

    // Filter by query string if provided
    let filtered = source;
    if (q) {
      filtered = source.filter((c) => c.name.toLowerCase().includes(q));

      // ✅ Prioritize U.S. cities
      filtered.sort((a, b) => {
        if (a.countryCode === "US" && b.countryCode !== "US") return -1;
        if (a.countryCode !== "US" && b.countryCode === "US") return 1;
        return 0; // otherwise maintain relative order
      });
    }

    // Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / limNum);
    const start = (pageNum - 1) * limNum;
    const end = start + limNum;
    const items = filtered.slice(start, end);

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Cities fetched successfully.",
      pagination: {
        page: pageNum,
        limit: limNum,
        totalItems,
        totalPages,
      },
      data: items,
    });
  } catch (err) {
    console.error("searchCities error:", err);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to fetch cities.",
      data: null,
    });
  }
};

export const getCityFromCoords = async (req, res) => {
  try {
    const { lat, lon } = req.body || {};

    if (!lat || !lon) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Latitude and Longitude are required",
        data: null,
      });
    }

    console.info(
      `[Location Detection] Request received for lat=${lat}, lon=${lon}`
    );

    // Mapbox - Reverse Geocoding API
    const { data } = await axios.get(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json`,
      {
        params: {
          access_token: process.env.MAPBOX_ACCESS_TOKEN,
          limit: 1,
          types: "place",
        },
      }
    );

    const city = data?.features[0]?.text;

    console.info(
      `[Location Detection] Successfully detected city "${city}" for coordinates (${lat}, ${lon})`
    );

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "City detected successfully",
      data: { city, fullAddress: data?.display_name },
    });
  } catch (e) {
    console.error(e);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      data: null,
    });
  }
};
