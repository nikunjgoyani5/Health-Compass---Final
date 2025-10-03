import slugify from "slugify";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import Plan from "../models/plan.model.js";

const createPlan = async (req, res) => {
  try {
    const data = req.body;

    // Check if name already exists
    const isNameExist = await Plan.findOne({ name: data.name, isActive: true });
    if (isNameExist) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Plan name already exists.",
      });
    }

    // Helper to check duplicates in array by key
    const hasDuplicates = (arr, key) => {
      if (!Array.isArray(arr)) return false;
      const seen = new Set();
      for (const item of arr) {
        const value = (item[key] || "").trim().toLowerCase();
        if (seen.has(value)) return true;
        seen.add(value);
      }
      return false;
    };

    // Validate uniqueness in access_name
    if (hasDuplicates(data.access, "access_name")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'access'. Each access_name must be unique.",
      });
    }

    // Validate uniqueness in include_name
    if (hasDuplicates(data.includes, "include_name")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'includes'. Each include_name must be unique.",
      });
    }

    // Validate uniqueness in add_name
    if (hasDuplicates(data.adds, "add_name")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'adds'. Each add_name must be unique.",
      });
    }

    // Validate uniqueness in price label
    if (hasDuplicates(data.prices, "label")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'prices'. Each label must be unique.",
      });
    }

    // Auto-generate slug from name if not provided
    if (data.name) {
      data.slug = slugify(data.name, {
        lower: true,
        strict: true, // remove special chars
        trim: true,
      });
    }

    // Create the plan
    const result = await Plan.create(data);

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      status: true,
      data: result,
      message: "Plan entry created successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Error creating plan entry.",
    });
  }
};

const getPlan = async (req, res) => {
  try {
    let {
      isActive,
      name,
      slug,
      minRank,
      maxRank,
      currency,
      interval,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = isActive === "true"; // convert to boolean
    }

    if (name) {
      filter.name = { $regex: name, $options: "i" }; // partial case-insensitive match
    }

    if (slug) {
      filter.slug = { $regex: slug, $options: "i" };
    }

    if (minRank || maxRank) {
      filter.rank = {};
      if (minRank) filter.rank.$gte = parseInt(minRank);
      if (maxRank) filter.rank.$lte = parseInt(maxRank);
    }

    if (currency) {
      filter["prices.currency"] = currency.toUpperCase();
    }

    if (interval) {
      filter["prices.interval"] = interval;
    }

    // Fetch data (without final sort)
    let data = await Plan.find(filter).sort({ rank: 1 });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data,
      message: "Plans fetched successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Error fetching plans.",
    });
  }
};

const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Check if plan exists
    const existingPlan = await Plan.findById(id);
    if (!existingPlan) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Plan not found.",
      });
    }

    // If name is being updated, ensure it's unique among active plans
    if (data.name) {
      const isNameExist = await Plan.findOne({
        _id: { $ne: id },
        name: data.name,
        isActive: true,
      });

      if (isNameExist) {
        return apiResponse({
          res,
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Plan name already exists.",
        });
      }
    }

    // Auto-generate slug from name if not provided
    if (data.name) {
      data.slug = slugify(data.name, {
        lower: true,
        strict: true, // remove special chars
        trim: true,
      });
    }

    // Helper to check duplicates in array by key
    const hasDuplicates = (arr, key) => {
      if (!Array.isArray(arr)) return false;
      const seen = new Set();
      for (const item of arr) {
        const value = (item[key] || "").trim().toLowerCase();
        if (seen.has(value)) return true;
        seen.add(value);
      }
      return false;
    };

    // Validate uniqueness in access_name
    if (hasDuplicates(data.access, "access_name")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'access'. Each access_name must be unique.",
      });
    }

    // Validate uniqueness in include_name
    if (hasDuplicates(data.includes, "include_name")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'includes'. Each include_name must be unique.",
      });
    }

    // Validate uniqueness in add_name
    if (hasDuplicates(data.adds, "add_name")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'adds'. Each add_name must be unique.",
      });
    }

    // Validate uniqueness in price label
    if (hasDuplicates(data.prices, "label")) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message:
          "Duplicate values found in 'prices'. Each label must be unique.",
      });
    }

    // Update plan
    const updatedPlan = await Plan.findByIdAndUpdate(id, data, { new: true });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: updatedPlan,
      message: "Plan updated successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Error updating plan entry.",
    });
  }
};

const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const isExist = await Plan.findById(id);
    if (!isExist) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Plan not found.",
      });
    }

    await Plan.findByIdAndDelete(id);

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      status: true,
      data: null,
      message: "Plan deleted successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Error creating plan entry.",
    });
  }
};

export default {
  createPlan,
  getPlan,
  updatePlan,
  deletePlan,
};
