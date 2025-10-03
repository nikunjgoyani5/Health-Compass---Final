// controllers/miniBot.controller.js
import { StatusCodes } from "http-status-codes";
import {
  BOT_TITLE,
  getMainMenu,
  classifyUserMessageAI,   
  getAnswerByIntent,
  getFollowupsForIntent,
} from "../utils/miniBot.utils.js";
import { apiResponse } from "../helper/api-response.helper.js";

// GET: menu
export const getMiniBotMenu = async (_req, res) => {
  return apiResponse({
    res,
    status: true,
    statusCode: StatusCodes.OK,
    data: {
      title: BOT_TITLE,
      placeholder: "Ask a question",
      menu: getMainMenu(),
    },
    message: "Mini bot menu fetched successfully.",


    
  });
};

// POST: chat
export const chatWithMiniBot = async (req, res) => {
  try {
    const { message = "", intentId = "" } = req.body || {};

    // Always use GPT for classification if message provided, otherwise fallback to intentId
    const intent = intentId || await classifyUserMessageAI(message);

    const answer = getAnswerByIntent(intent);
    const suggestions = getFollowupsForIntent(intent);

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: { intentId: intent, answer, suggestions },
      message: "Mini bot reply",
    });
  } catch (error) {
    console.error("Mini bot error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Something went wrong.",
    });
  }
};

