import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import InteractionModel from "../models/interaction.model.js";
import MedicineModel from "../models/medicine.model.js";
import SupplementModel from "../models/supplements.model.js";
import { getAIInteraction, getAIMultipleItemsInteraction } from "../services/openAi.service.js";
import enumConfig from "../config/enum.config.js";

const validSeverities = Object.values(enumConfig.severityLevelEnums);

const checkInteractions = async (req, res) => {
  const { items } = req.body;

  console.log("[INTERACTIONS] Starting interaction check", {
    itemCount: items?.length || 0,
    items: items?.map(item => ({ id: item.id, type: item.type })) || []
  });

  try {
    // Step 1: Validate items and get names
    console.log("[INTERACTIONS] Step 1: Validating items and getting names");
    const resolved = [];
    const notFound = [];

    for (const item of items) {
      console.log(`[INTERACTIONS] Validating item: ID ${item.id} (${item.type})`);
      const Model = item.type === "medicine" ? MedicineModel : SupplementModel;
      const record = await Model.findOne({
        _id: new mongoose.Types.ObjectId(item.id)
      });

      // if record is not found, check if the item is a medicine or supplement
      if (!record) {
        console.log(`[INTERACTIONS] Item not found: ID ${item.id} (${item.type})`);
        notFound.push(item.id);
      } else {
        const name = record.medicineName || record.productName;
        console.log(`[INTERACTIONS] Item validated: ID ${item.id} -> Name: "${name}" (${item.type})`);
        resolved.push({ type: item.type, id: item.id, name: name });
      }
    }

    console.log("[INTERACTIONS] Validation summary", {
      totalItems: items.length,
      resolved: resolved.length,
      notFound: notFound.length,
      resolvedItems: resolved.map(r => ({ name: r.name, type: r.type, id: r.id }))
    });

    if (resolved.length < 2) {
      console.log("[INTERACTIONS] Insufficient valid items for interaction check", {
        resolvedCount: resolved.length,
        notFoundItems: notFound,
        message: "Need at least 2 valid items to check interactions"
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Not enough valid items provided.",
        data: {
          summary: {
            severity: "None",
            explanation: "Not enough valid items provided.",
            disclaimer: enumConfig.intersactionDefaultEnums.ROOT_DISCLAIMER,
          },
          notFound,
          conflicts: [],
        },
      });
    }

    // Step 2: Check for existing multi-item interaction in database
    console.log("[INTERACTIONS] Step 2: Checking for existing multi-item interaction");
    
    // Create a unique identifier for this combination of items
    const sortedItems = resolved.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id.toString().localeCompare(b.id.toString());
    });
    
    const itemIds = sortedItems.map(item => item.id);
    const itemTypes = sortedItems.map(item => item.type);
    
    // Check if we have an existing interaction for this exact combination
    let existingInteraction = await InteractionModel.findOne({
      itemAType: itemTypes[0],
      itemAId: new mongoose.Types.ObjectId(itemIds[0]),
      itemBType: itemTypes[1] || itemTypes[0],
      itemBId: new mongoose.Types.ObjectId(itemIds[1] || itemIds[0]),
      // Add a flag to identify multi-item interactions
      isMultiItem: true,
      itemCount: resolved.length
    });

    let conflict;

    if (existingInteraction) {
      console.log("[INTERACTIONS] Found existing multi-item interaction in database", {
        itemCount: resolved.length,
        severity: existingInteraction.severity,
        source: "database"
      });
      conflict = existingInteraction;
    } else {
      console.log("[INTERACTIONS] No existing multi-item interaction found, checking with AI", {
        itemCount: resolved.length,
        items: resolved.map(item => ({ name: item.name, type: item.type })),
        source: enumConfig.interactionSourceEnums.AI
      });

      // Call AI for multiple items
      let aiResult;
      try {
        aiResult = await getAIMultipleItemsInteraction(resolved);
      } catch (err) {
        console.error("AI call failed:", err.message);
        aiResult = {
          severity: enumConfig.severityLevelEnums.MODERATE,
          explanation: enumConfig.intersactionDefaultEnums.EXPLANATION,
          disclaimer: enumConfig.intersactionDefaultEnums.AI_DISCLAIMER,
        };
      }

      // Validate severity against enum values
      const severity = validSeverities.includes(aiResult.severity)
        ? aiResult.severity
        : enumConfig.severityLevelEnums.MODERATE;

      const explanation =
        (aiResult.explanation && aiResult.explanation.trim()) || enumConfig.intersactionDefaultEnums.EXPLANATION;
      const disclaimer =
        (aiResult.disclaimer && aiResult.disclaimer.trim()) || enumConfig.intersactionDefaultEnums.AI_DISCLAIMER;

      // Create interaction record for multi-item combination
      try {
        conflict = await InteractionModel.create({
          itemAType: itemTypes[0],
          itemAId: new mongoose.Types.ObjectId(itemIds[0]),
          itemBType: itemTypes[1] || itemTypes[0],
          itemBId: new mongoose.Types.ObjectId(itemIds[1] || itemIds[0]),
          severity,
          explanation,
          disclaimer,
          source: enumConfig.interactionSourceEnums.AI,
          isMultiItem: true,
          itemCount: resolved.length,
          allItems: resolved.map(item => ({
            type: item.type,
            id: item.id,
            name: item.name
          }))
        });
      } catch (saveErr) {
        if (saveErr.code === 11000) {
          // Duplicate key race condition—fetch existing
          conflict = await InteractionModel.findOne({
            itemAType: itemTypes[0],
            itemAId: new mongoose.Types.ObjectId(itemIds[0]),
            itemBType: itemTypes[1] || itemTypes[0],
            itemBId: new mongoose.Types.ObjectId(itemIds[1] || itemIds[0]),
            isMultiItem: true,
            itemCount: resolved.length
          });
        } else {
          console.error("Failed to save multi-item interaction:", saveErr.message);
          // Fallback: still return AI-generated data
          conflict = {
            itemAType: itemTypes[0],
            itemAId: itemIds[0],
            itemBType: itemTypes[1] || itemTypes[0],
            itemBId: itemIds[1] || itemIds[0],
            severity,
            explanation,
            disclaimer,
            source: enumConfig.interactionSourceEnums.AI,
            isMultiItem: true,
            itemCount: resolved.length,
            allItems: resolved.map(item => ({
              type: item.type,
              id: item.id,
              name: item.name
            }))
          };
        }
      }
    }

    // Create single conflict object for all items with individual item fields
    const conflictObj = {
      severity: conflict?.severity || enumConfig.severityLevelEnums.MODERATE,
      explanation: conflict?.explanation || enumConfig.intersactionDefaultEnums.EXPLANATION,
      disclaimer: conflict?.disclaimer || enumConfig.intersactionDefaultEnums.AI_DISCLAIMER,
      source: conflict?.source || enumConfig.interactionSourceEnums.MANUAL
    };

    // Add individual item fields (itemA, itemB, itemC, etc.)
    resolved.forEach((item, index) => {
      const fieldName = index === 0 ? 'itemA' : 
                       index === 1 ? 'itemB' : 
                       index === 2 ? 'itemC' : 
                       index === 3 ? 'itemD' : 
                       index === 4 ? 'itemE' : 
                       `item${String.fromCharCode(65 + index)}`;
      
      const typeFieldName = index === 0 ? 'itemAType' : 
                           index === 1 ? 'itemBType' : 
                           index === 2 ? 'itemCType' : 
                           index === 3 ? 'itemDType' : 
                           index === 4 ? 'itemEType' : 
                           `item${String.fromCharCode(65 + index)}Type`;
      
      conflictObj[fieldName] = item.name;
      conflictObj[typeFieldName] = item.type;
    });

    const conflicts = [conflictObj];

    console.log("[INTERACTIONS] Interaction checking completed", {
      totalItems: resolved.length,
      conflictsFound: conflicts.length,
      conflictItems: conflicts[0] ? Object.keys(conflicts[0]).filter(key => key.startsWith('item') && !key.includes('Type')).map(key => conflicts[0][key]) : [],
      conflictsBySeverity: conflicts.reduce((acc, conflict) => {
        acc[conflict.severity] = (acc[conflict.severity] || 0) + 1;
        return acc;
      }, {})
    });

    // Step 3: Compute summary
    console.log("[INTERACTIONS] Step 3: Computing summary and finalizing response");

    const summary = conflicts.length && conflicts[0]
      ? {
        severity: conflicts[0].severity || enumConfig.severityLevelEnums.MODERATE,
        explanation: conflicts[0].explanation || enumConfig.intersactionDefaultEnums.EXPLANATION,
        disclaimer: conflicts[0].disclaimer || enumConfig.intersactionDefaultEnums.AI_DISCLAIMER
      }
      : {
        severity: "None",
        explanation: "No meaningful interactions found.",
        disclaimer: enumConfig.intersactionDefaultEnums.ROOT_DISCLAIMER
      };

    console.log("[INTERACTIONS] Summary computation", {
      totalConflicts: conflicts.length,
      highestSeverity: summary.severity,
      itemCount: resolved.length,
      severityBreakdown: conflicts.reduce((acc, conflict) => {
        acc[conflict.severity] = (acc[conflict.severity] || 0) + 1;
        return acc;
      }, {})
    });

    console.log("[INTERACTIONS] Interaction check completed successfully", {
      finalSummary: {
        severity: summary.severity,
        explanation: summary.explanation,
        totalConflicts: conflicts.length,
        notFoundItems: notFound.length,
        itemCount: resolved.length
      },
      responseData: {
        summary: summary.severity,
        conflictsCount: conflicts.length,
        notFoundCount: notFound.length,
        itemCount: resolved.length,
        conflictItems: conflicts[0] ? Object.keys(conflicts[0]).filter(key => key.startsWith('item') && !key.includes('Type')).map(key => conflicts[0][key]) : []
      }
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Interactions checked successfully.",
      data: { summary, notFound, conflicts },
    });
  } catch (error) {
    console.error("[INTERACTIONS] Error occurred during interaction check", error);

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error while checking interactions.",
      data: null,
    });
  }
};

// Get interaction history
const getInteractionHistory = async (req, res) => {
  try {
    const { type, severity, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (type) {
      // Match interactions where either item is of the specified type
      filter.$or = [{ itemAType: type }, { itemBType: type }];
    }
    if (severity) {
      filter.severity = severity;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const interactions = await InteractionModel.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Resolve names for display
    const results = [];
    for (const i of interactions) {
      const aModel = i.itemAType === "medicine" ? MedicineModel : SupplementModel;
      const bModel = i.itemBType === "medicine" ? MedicineModel : SupplementModel;

      const [aDoc, bDoc] = await Promise.all([
        aModel.findById(i.itemAId).lean(),
        bModel.findById(i.itemBId).lean(),
      ]);

      results.push({
        itemA: aDoc?.medicineName || aDoc?.productName || "Unknown",
        itemAType: i.itemAType,
        itemB: bDoc?.medicineName || bDoc?.productName || "Unknown",
        itemBType: i.itemBType,
        severity: i.severity,
        explanation: i.explanation,
        disclaimer: i.disclaimer,
        source: i.source,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      });
    }

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Interaction history fetched successfully.",
      data: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: results.length,
        interactions: results,
      },
    });
  } catch (error) {
    console.error("Error occurred during interaction history fetch", error);

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error while fetching interaction history.",
      data: null,
    });
  }
};

export default {
  checkInteractions,
  getInteractionHistory,
};
