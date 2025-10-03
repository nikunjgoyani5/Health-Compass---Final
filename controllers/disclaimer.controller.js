import Disclaimer from "../models/disclaimer.model.js";
import { apiResponse } from "../helper/api-response.helper.js";
import { DISCLAIMER_TYPES_ARRAY, DISCLAIMER_TYPES_INFO } from "../config/disclaimer.config.js";

// Create new disclaimer
export const createDisclaimer = async (req, res) => {
  try {
    const { type, title, content } = req.body;

    // Validate required fields
    if (!type || !title || !content) {
      return apiResponse({
        res,
        status: false,
        statusCode: 400,
        data: null,
        message: "Type, title, and content are required fields."
      });
    }

    // Check if type is valid
    if (!DISCLAIMER_TYPES_ARRAY.includes(type)) {
      return apiResponse({
        res,
        status: false,
        statusCode: 400,
        data: null,
        message: "Invalid disclaimer type. Valid types are: " + DISCLAIMER_TYPES_ARRAY.join(", ")
      });
    }

    // Deactivate previous disclaimer of same type
    await Disclaimer.updateMany(
      { type, isActive: true },
      { isActive: false }
    );

    // Create new disclaimer
    const disclaimer = new Disclaimer({
      type,
      title,
      content,
      createdBy: req.user._id
    });

    await disclaimer.save();

    return apiResponse({
      res,
      status: true,
      statusCode: 201,
      data: disclaimer.getFormattedContent(),
      message: "Disclaimer created successfully."
    });

  } catch (error) {
    console.error("Error creating disclaimer:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error while creating disclaimer."
    });
  }
};

// Get all disclaimers - Only active disclaimers (isActive: true)
export const getAllDisclaimers = async (req, res) => {
  try {
    const { type, page = 1, limit = 10 } = req.query;

    const query = { isActive: true }; // Only active disclaimers
    
    if (type) {
      query.type = type;
    }

    const skip = (page - 1) * limit;

    const disclaimers = await Disclaimer.find(query)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Disclaimer.countDocuments(query);

    const formattedDisclaimers = disclaimers.map(disclaimer => 
      disclaimer.getFormattedContent()
    );

    return apiResponse({
      res,
      status: true,
      statusCode: 200,
      data: {
        disclaimers: formattedDisclaimers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      },
      message: "Active disclaimers retrieved successfully."
    });

  } catch (error) {
    console.error("Error getting disclaimers:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error while retrieving disclaimers."
    });
  }
};

// Get disclaimer by ID - Only if active (isActive: true)
export const getDisclaimerById = async (req, res) => {
  try {
    const { id } = req.params;

    const disclaimer = await Disclaimer.findOne({ 
      _id: id, 
      isActive: true 
    }).populate("createdBy", "name email");

    if (!disclaimer) {
      return apiResponse({
        res,
        status: false,
        statusCode: 404,
        data: null,
        message: "Active disclaimer not found."
      });
    }

    return apiResponse({
      res,
      status: true,
      statusCode: 200,
      data: disclaimer.getFormattedContent(),
      message: "Active disclaimer retrieved successfully."
    });

  } catch (error) {
    console.error("Error getting disclaimer by ID:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error while retrieving disclaimer."
    });
  }
};


// Update disclaimer - सभी fields update कर सकती है
export const updateDisclaimer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if disclaimer exists
    const disclaimer = await Disclaimer.findById(id);
    if (!disclaimer) {
      return apiResponse({
        res,
        status: false,
        statusCode: 404,
        data: null,
        message: "Disclaimer not found."
      });
    }

    // Validate type if provided
    if (updateData.type && !DISCLAIMER_TYPES_ARRAY.includes(updateData.type)) {
      return apiResponse({
        res,
        status: false,
        statusCode: 400,
        data: null,
        message: "Invalid disclaimer type. Valid types are: " + DISCLAIMER_TYPES_ARRAY.join(", ")
      });
    }

    // Update all provided fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        disclaimer[key] = updateData[key];
      }
    });

    await disclaimer.save();

    return apiResponse({
      res,
      status: true,
      statusCode: 200,
      data: disclaimer.getFormattedContent(),
      message: "Disclaimer updated successfully."
    });

  } catch (error) {
    console.error("Error updating disclaimer:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error while updating disclaimer."
    });
  }
};

// Delete disclaimer (soft delete)
export const deleteDisclaimer = async (req, res) => {
  try {
    const { id } = req.params;

    const disclaimer = await Disclaimer.findById(id);

    if (!disclaimer) {
      return apiResponse({
        res,
        status: false,
        statusCode: 404,
        data: null,
        message: "Disclaimer not found."
      });
    }

    // Soft delete by deactivating
    disclaimer.isActive = false;
    await disclaimer.save();

    return apiResponse({
      res,
      status: true,
      statusCode: 200,
      data: null,
      message: "Disclaimer deleted successfully."
    });

  } catch (error) {
    console.error("Error deleting disclaimer:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error while deleting disclaimer."
    });
  }
};





// Default export for all controller functions - Only 5 APIs
export default {
  createDisclaimer,
  getAllDisclaimers,
  getDisclaimerById,
  updateDisclaimer,
  deleteDisclaimer
};