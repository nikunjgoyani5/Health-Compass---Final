import { StatusCodes } from "http-status-codes";
import { FoodModel, MealLog } from "../models/food.model.js";
import { apiResponse } from "../helper/api-response.helper.js";
import axios from "axios";

const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v0/product";

/**
 * Lookup food details by barcode
 * @param {string} barcode
 * @returns {Object|null} nutrition data
 */
export const nutritionAPIService = {
  lookupByBarcode: async (barcode) => {
    try {
      // Example: OpenFoodFacts
      const url = `${OPEN_FOOD_FACTS_API}/${barcode}.json`;
      const { data } = await axios.get(url);

      if (!data || data.status === 0) {
        return null; // no match
      }

      const product = data.product;

      return {
        productName: product.product_name || "Unknown",
        brandName: product.brands || "Unknown",
        calories: product.nutriments?.["energy-kcal_100g"] || null,
        protein: product.nutriments?.["proteins_100g"] || null,
        carbs: product.nutriments?.["carbohydrates_100g"] || null,
        fat: product.nutriments?.["fat_100g"] || null,
        ingredients: product.ingredients_text
          ? product.ingredients_text.split(",").map((i) => i.trim())
          : [],
      };
    } catch (err) {
      console.error("Nutrition API Error:", err.message);
      return null;
    }
  },
};

export const lookupFoodByBarcode = async (req, res) => {
  try {
    const { barcode } = req.body;

    if (!barcode) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Barcode is required.",
        data: null,
      });
    }

    // 1. Check local DB first
    let existingFood = await FoodModel.findOne({ barcode });
    if (existingFood) {
      // Log scan attempt in AuditLogs
      console.log({
        userId: req.user.id,
        action: "SCAN_LOOKUP",
        barcode,
        status: "FOUND_LOCAL",
      });

      return apiResponse({
        res,
        status: true,
        statusCode: StatusCodes.OK,
        message: "Food found in local DB.",
        data: existingFood,
      });
    }

    // 2. If not found → Call external nutrition API (e.g., USDA / OpenFoodFacts)
    const nutritionData = await nutritionAPIService.lookupByBarcode(barcode);
    console.log({ nutritionData });

    if (!nutritionData) {
      // Log "not found" attempt
      console.log({
        userId: req.user.id,
        action: "SCAN_LOOKUP",
        barcode,
        status: "NOT_FOUND",
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "No match found. Please enter manually.",
        data: null,
      });
    }

    // 3. Save food in DB for caching
    const newFood = await FoodModel.create({
      barcode,
      productName: nutritionData.productName,
      brandName: nutritionData.brandName,
      calories: nutritionData.calories,
      protein: nutritionData.protein,
      carbs: nutritionData.carbs,
      fat: nutritionData.fat,
      ingredients: nutritionData.ingredients,
      createdBy: req.user.id,
    });

    // Log success
    console.log({
      userId: req.user.id,
      action: "SCAN_LOOKUP",
      barcode,
      status: "FOUND_API",
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Food found via external API.",
      data: newFood,
    });
  } catch (error) {
    console.error("Barcode Lookup Error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};

export const logMeal = async (req, res) => {
  try {
    const { barcode, manualEntry } = req.body;

    if (!barcode && !manualEntry) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Either barcode or manualEntry data is required.",
        data: null,
      });
    }

    // 1. Fetch food details (barcode or manual input)
    let foodData = null;
    if (barcode) {
      foodData = await FoodModel.findOne({ barcode });
    }

    if (!foodData && manualEntry) {
      foodData = await FoodModel.create({
        ...manualEntry,
        createdBy: req.user.id,
        source: "MANUAL",
      });
    }

    if (!foodData) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Food data not available.",
        data: null,
      });
    }

    // 2. Save in MealLogs
    const mealLog = await MealLog.create({
      userId: req.user.id,
      food: foodData._id,
      loggedAt: new Date(),
    });

    // 3. Log activity
    console.log({
      userId: req.user.id,
      action: "MEAL_LOG",
      barcode: barcode || null,
      status: "LOGGED",
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      message: "Meal logged successfully.",
      data: mealLog,
    });
  } catch (error) {
    console.error("Log Meal Error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
      data: null,
    });
  }
};
