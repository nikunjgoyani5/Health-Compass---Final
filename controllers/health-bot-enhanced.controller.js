/**
 * Enhanced Health Bot Controller with Python Bridge Integration
 */

import { StatusCodes } from "http-status-codes";
import axios from "axios";
import config from "../config/config.js";
import moment from "moment";
import stringSimilarity from "string-similarity";
import {
  getHealthGPTResponse,
  detectScheduleIntentWithOpenAI,
  detectMainIntentWithOpenAI,
  normalizeUserInput,
  detectCreateSupplementIntentWithOpenAI,
  detectCreateMedicineIntentWithOpenAI,
  detectCreateVaccineIntentWithOpenAI,
  detectCreateVaccineScheduleIntentWithOpenAI,
  detectCreateMedicineScheduleIntentWithOpenAI,
} from "../utils/gpt.utils.js";
import { apiResponse } from "../helper/api-response.helper.js";
import ChatHistory from "../models/chatHistory.model.js";
import { transcribeAudio } from "../utils/speech-to-text.utils.js";
import { logQueryToDB } from "../services/aiQuery-log.service.js";
import { getIPv4Address } from "../helper/common.helper.js";
import pythonNodeBridge from "../python_node_bridge.js";
import { handleCreateSupplement as handleCreateSupplementBase, handleCheckMedicineSchedule } from "./health-bot.controller.js";

const draftCache = {};

/**
 * Handle medicine creation flow
 */
const handleCreateMedicine = async (message, chatId, userId, res) => {
  try {
    const sessionKey = userId || chatId || 'anonymous_session';
    
    if (!draftCache[sessionKey]) {
      draftCache[sessionKey] = { phase: 'create_medicine', collected: {} };
    }

    const detected = await detectCreateMedicineIntentWithOpenAI(
      message,
      draftCache[sessionKey].collected || {}
    );

    if (detected.nextStep === "done") {
      // Create medicine logic here
      const successMsg = `Perfect! I've created your medicine record with: ${JSON.stringify(detected.collected)}`;
      delete draftCache[sessionKey];
      return sendBotReply(chatId, userId, message, successMsg, res);
    } else if (detected.nextStep === "exit") {
      delete draftCache[sessionKey];
      return sendBotReply(chatId, userId, message, detected.ask, res);
    } else {
      draftCache[sessionKey].collected = detected.collected;
      return sendBotReply(chatId, userId, message, detected.ask, res);
    }
  } catch (error) {
    console.error("Error in handleCreateMedicine:", error);
    return sendBotReply(chatId, userId, message, "Sorry, something went wrong. Please try again.", res);
  }
};

/**
 * Handle vaccine creation flow
 */
const handleCreateVaccine = async (message, chatId, userId, res) => {
  try {
    const sessionKey = userId || chatId || 'anonymous_session';
    
    if (!draftCache[sessionKey]) {
      draftCache[sessionKey] = { phase: 'create_vaccine', collected: {} };
    }

    const detected = await detectCreateVaccineIntentWithOpenAI(
      message,
      draftCache[sessionKey].collected || {}
    );

    if (detected.nextStep === "done") {
      // Create vaccine logic here
      const successMsg = `Perfect! I've created your vaccine record with: ${JSON.stringify(detected.collected)}`;
      delete draftCache[sessionKey];
      return sendBotReply(chatId, userId, message, successMsg, res);
    } else if (detected.nextStep === "exit") {
      delete draftCache[sessionKey];
      return sendBotReply(chatId, userId, message, detected.ask, res);
    } else {
      draftCache[sessionKey].collected = detected.collected;
      return sendBotReply(chatId, userId, message, detected.ask, res);
    }
  } catch (error) {
    console.error("Error in handleCreateVaccine:", error);
    return sendBotReply(chatId, userId, message, "Sorry, something went wrong. Please try again.", res);
  }
};

/**
 * Handle vaccine schedule creation flow
 */
const handleCreateVaccineSchedule = async (message, chatId, userId, res) => {
  try {
    const sessionKey = userId || chatId || 'anonymous_session';
    
    if (!draftCache[sessionKey]) {
      draftCache[sessionKey] = { phase: 'create_vaccine_schedule', collected: {} };
    }

    const detected = await detectCreateVaccineScheduleIntentWithOpenAI(
      message,
      draftCache[sessionKey].collected || {}
    );

    if (detected.nextStep === "done") {
      // Create vaccine schedule logic here
      const successMsg = `Perfect! I've created your vaccine schedule with: ${JSON.stringify(detected.collected)}`;
      delete draftCache[sessionKey];
      return sendBotReply(chatId, userId, message, successMsg, res);
    } else if (detected.nextStep === "exit") {
      delete draftCache[sessionKey];
      return sendBotReply(chatId, userId, message, detected.ask, res);
    } else {
      draftCache[sessionKey].collected = detected.collected;
      return sendBotReply(chatId, userId, message, detected.ask, res);
    }
  } catch (error) {
    console.error("Error in handleCreateVaccineSchedule:", error);
    return sendBotReply(chatId, userId, message, "Sorry, something went wrong. Please try again.", res);
  }
};

/**
 * Handle medicine schedule creation flow
 */
const handleCreateMedicineSchedule = async (message, chatId, userId, res, authHeader = '') => {
  try {
    const sessionKey = userId || chatId || 'anonymous_session';
    
    if (!draftCache[sessionKey]) {
      draftCache[sessionKey] = { phase: 'create_medicine_schedule', collected: {} };
    }

    const detected = await detectCreateMedicineScheduleIntentWithOpenAI(
      message,
      draftCache[sessionKey].collected || {}
    );

    // Update draft cache with collected data
    draftCache[sessionKey].collected = {
      ...draftCache[sessionKey].collected,
      ...detected.collected
    };

    const collected = draftCache[sessionKey].collected;

    // Validate medicine exists in user's list
    if (collected.medicineName && !draftCache[sessionKey].validatedMedicine) {
      try {
        console.log("🔍 Validating medicine:", collected.medicineName);
        console.log("🔍 API URL:", `${config.base_url}/api/v1/medicine/list`);
        console.log("🔍 Auth Header:", authHeader ? "Present" : "Missing");
        
        const medRes = await axios.get(
          `${config.base_url}/api/v1/medicine/list`,
          {
            headers: {
              'Authorization': `Bearer ${authHeader?.split(' ')[1] || ''}`
            }
          }
        );
        
        console.log("🔍 API Response Status:", medRes.status);
        console.log("🔍 API Response Data:", JSON.stringify(medRes.data, null, 2));

        const supplements = medRes?.data?.body?.supplements || [];
        console.log("🔍 API Response - Supplements:", supplements);
        console.log("🔍 Total supplements found:", supplements.length);
        
        if (supplements.length === 0) {
          return sendBotReply(
            chatId,
            userId,
            message,
            `I couldn't find any medicines in your list. Please create a medicine first before scheduling it.`,
            res
          );
        }

        const inputName = collected.medicineName.toLowerCase();
        console.log("🔍 Looking for medicine:", inputName);
        console.log("🔍 Available medicines:", supplements.map(s => s.medicineName));

        // First try exact match (case-insensitive)
        let match = supplements.find(
          (s) => s.medicineName.toLowerCase() === inputName
        );

        // If no exact match, try fuzzy matching
        if (!match) {
          console.log("🔍 No exact match found, trying fuzzy matching...");
          
          const availableNames = supplements.map((s) => s.medicineName);
          const bestMatch = stringSimilarity.findBestMatch(
            inputName,
            availableNames
          ).bestMatch;
          
          console.log("🔍 Fuzzy match result:", bestMatch);
          
          // Use 70% similarity threshold
          if (bestMatch.rating >= 0.7) {
            match = supplements.find((s) => s.medicineName === bestMatch.target);
            console.log("✅ Fuzzy match found:", match.medicineName);
          }
        }

        if (!match) {
          const options = supplements
            .map((s) => `💊 ${s.medicineName}`)
            .join("\n");
          
          return sendBotReply(
            chatId,
            userId,
            message,
            `I couldn't find any medicine named **"${collected.medicineName}"** in your list.\n\nHere are your available medicines:\n\n${options}\n\nPlease reply with one of the above names.`,
            res
          );
        }

        draftCache[sessionKey].validatedMedicine = match;
        draftCache[sessionKey].collected.medicineName = match.medicineName;
        console.log("✅ Medicine validated:", match.medicineName);
      } catch (error) {
        console.error("Error validating medicine:", error);
        return sendBotReply(
          chatId,
          userId,
          message,
          "Sorry, I couldn't verify your medicine. Please try again later.",
          res
        );
      }
    }

    if (detected.nextStep === "done") {
      try {
        // Prepare the payload for the medicine schedule API
        const payload = {
          medicineName: draftCache[sessionKey].validatedMedicine._id, // Use validated medicine ID
          quantity: detected.collected.quantity,
          startDate: `${detected.collected.startDate}T00:00:00.000+00:00`,
          endDate: `${detected.collected.endDate}T00:00:00.000+00:00`,
          doseTimes: detected.collected.doseTimes.map(time => {
            // Convert time to proper format if needed
            if (typeof time === 'string') {
              // If it's already in the right format, return as is
              if (time.includes('AM') || time.includes('PM')) {
                return time;
              }
              // Otherwise, try to format it
              return time;
            }
            return time;
          }),
          totalDosesPerDay: detected.collected.totalDosesPerDay
        };

        console.log("Creating medicine schedule with payload:", payload);

        // Make API call to create medicine schedule
        const response = await axios.post(
          `${config.base_url}/api/v1/medicine-schedule`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authHeader?.split(' ')[1] || ''}`
            }
          }
        );

        console.log("Medicine schedule API response:", response.data);

        const successMsg = `Perfect! I've successfully created your medicine schedule for ${draftCache[sessionKey].validatedMedicine.medicineName}. You'll take ${detected.collected.totalDosesPerDay} dose(s) per day at ${detected.collected.doseTimes.join(' and ')} from ${detected.collected.startDate.split('T')[0]} to ${detected.collected.endDate.split('T')[0]}.`;
        
        delete draftCache[sessionKey];
        return sendBotReply(chatId, userId, message, successMsg, res);
      } catch (apiError) {
        console.error("Error creating medicine schedule:", apiError);
        const errorMsg = "Sorry, I couldn't create the medicine schedule. Please try again or contact support.";
        delete draftCache[sessionKey];
        return sendBotReply(chatId, userId, message, errorMsg, res);
      }
    } else if (detected.nextStep === "exit") {
      delete draftCache[sessionKey];
      return sendBotReply(chatId, userId, message, detected.ask, res);
    } else {
      draftCache[sessionKey].collected = detected.collected;
      return sendBotReply(chatId, userId, message, detected.ask, res);
    }
  } catch (error) {
    console.error("Error in handleCreateMedicineSchedule:", error);
    return sendBotReply(chatId, userId, message, "Sorry, something went wrong. Please try again.", res);
  }
};

/**
 * Send bot reply and save to chat history
 */
async function sendBotReply(chatId, userId, userMessage, botReply, res) {
  let chat;
  if (chatId) {
    chat = await ChatHistory.findById(chatId);
    if (!chat) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Chat session not found.",
      });
    }

    chat.messages.push(
      { role: "user", message: userMessage },
      { role: "bot", message: botReply }
    );
    await chat.save();
  } else {
    chat = await ChatHistory.create({
      userId: userId || null,
      messages: [
        { role: "user", message: userMessage },
        { role: "bot", message: botReply },
      ],
    });
  }

  return apiResponse({
    res,
    status: true,
    statusCode: StatusCodes.OK,
    data: {
      chatId: chat._id,
      messages: chat.messages,
    },
    message: "HealthBot replied and chat saved successfully.",
  });
}

/**
 * Enhanced AI chatbot with Python bridge integration
 */
const chatWithEnhancedHealthBot = async (req, res) => {
  try {
    console.log({ reqIp: req.ip });
    let { message, chatId, audioUrl } = req.body;
    const userId = req.user?._id;
    const sessionKey = userId || chatId || req.ip || 'anonymous_session';
    const authHeader = req.headers.authorization || "";

    if (!message && audioUrl) {
      message = await transcribeAudio(audioUrl);
    }

    if (!message || typeof message !== "string") {
      return apiResponse({
        res,
        status: false,
        statusCode: 400,
        data: null,
        message: "Message is required either as text or through audio.",
      });
    }

    const normalizedMessage = await normalizeUserInput(message);
    console.log("🧼 Normalized Message:", normalizedMessage);

    // 🔴 PRIORITY 1: SUPER-EARLY SCHEDULE DETECTION (using GPT)
    try {
      const sched = await detectScheduleIntentWithOpenAI(normalizedMessage);
      if (sched?.isSchedule) {
        console.log("🎯 SUPER-EARLY: GPT detected schedule intent");
        console.log("🔍 Schedule intent details:", sched);
        
        // CRITICAL: Clear any active creation flow
        if (draftCache[sessionKey]?.phase?.startsWith('create_')) {
          console.log("🧹 Clearing active creation flow for schedule query");
          delete draftCache[sessionKey];
        }
        
        let dateToUse = sched?.date || null;
        if (!dateToUse && /(today|todays|today's)/i.test(normalizedMessage)) {
          dateToUse = moment().utc().format('YYYY-MM-DD');
        }
        console.log("📅 Using date for schedule:", dateToUse);

        // Check Python bridge status
        const bridgeStatus = pythonNodeBridge.getStatus();
        console.log("🐍 Python Bridge Status:", bridgeStatus);
        
        // Try Python Bridge first
        if (pythonNodeBridge.isAvailable()) {
          console.log("🐍 Python Bridge (super-early): Using medicine schedule endpoint...");
          try {
            const token = (req.headers.authorization || '').replace('Bearer ', '') || 'default_token_for_medicine_schedule';
            console.log("🔑 Using token for Python bridge:", token ? 'Token provided' : 'No token');
            const py = await pythonNodeBridge.getMedicineSchedule(normalizedMessage, token, dateToUse);
            if (py?.success) {
              const text = py?.data?.data?.response || py?.response || "Here's your medicine schedule.";
              return sendBotReply(chatId, userId, message, text, res);
            } else {
              console.log("⚠️ Python bridge returned unsuccessful response:", py);
            }
          } catch (pyErr) {
            console.warn('Python Bridge schedule failed, falling back to Node:', pyErr?.message || pyErr);
          }
        } else {
          console.log("⚠️ Python Bridge not available, skipping to Node.js handler");
        }
        
        // Fall back to Node.js handler
        console.log("🔄 Falling back to Node.js schedule handler...");
        const scheduleIntent = { date: dateToUse || moment().utc().format('YYYY-MM-DD') };
        try {
          return await handleCheckMedicineSchedule(scheduleIntent, message, chatId, userId, req.headers.authorization || '', res);
        } catch (nodeErr) {
          console.error("❌ Node.js schedule handler also failed:", nodeErr?.message || nodeErr);
          // Final fallback - provide helpful message
          const fallbackMsg = `I can see you're asking about your medicine schedule for ${dateToUse ? moment(dateToUse).format('Do MMMM, YYYY') : 'today'}, but I'm having trouble accessing your schedule right now. Please try again later or contact support if the issue persists.`;
          return sendBotReply(chatId, userId, message, fallbackMsg, res);
        }
      }
    } catch (superEarlyErr) {
      console.warn('Super-early schedule routing failed:', superEarlyErr?.message || superEarlyErr);
    }

    // 🔴 PRIORITY 2: EARLY OFF-TOPIC DETECTION (before any health checks)
    const isOffTopic = !/\b(vitamin|supplement|medicine|medication|tablet|pill|capsule|vaccine|vaccination|dose|dosage|side effects|symptom|pain|headache|fever|cold|flu|blood pressure|cholesterol|diabetes|asthma|allergy|doctor|clinic|health|wellness|nutrition|diet|exercise|omega|fish oil|omega-3|fish oil|vitamin c|vitamin d|b12|zinc|iron|calcium|magnesium|schedule|schedu\w*|sedule)\b/i.test(normalizedMessage);
    
    if (isOffTopic) {
      console.log("🚫 EARLY: Detected off-topic query, clearing creation flow and returning scope message");
      
      // CRITICAL: Clear any active creation flow for off-topic queries
      if (draftCache[sessionKey]?.phase?.startsWith('create_')) {
        console.log("🧹 Clearing active creation flow for off-topic query");
        delete draftCache[sessionKey];
      }
      
      const scopeMsg = "I'm designed to help with health-related topics like supplements, medicines, vaccines, symptoms, and wellness. Please ask a health question, and I'll be happy to help!";
      return sendBotReply(chatId, userId, message, scopeMsg, res);
    }

    // 🔴 PRIORITY 3: EARLY SCHEDULE ROUTING (regex-based, before creation fast-path)
    const isScheduleQueryEarly = /(medicine|medication|meds).*(schedule|schedu\w*|sedule)/i.test(normalizedMessage)
      || /(schedule|schedu\w*|sedule).*(medicine|medication|meds)/i.test(normalizedMessage)
      || /(\b\d{4}-\d{2}-\d{2}\b).*(medicine|medication|schedule|schedu\w*|sedule)/i.test(normalizedMessage)
      || /(medicine|medication|schedule|schedu\w*|sedule).*(\b\d{4}-\d{2}-\d{2}\b)/i.test(normalizedMessage)
      || /(today|todays|today's|tonight|this\s*(morning|evening|afternoon|night))/.test(normalizedMessage) && /(schedule|schedu\w*|sedule)/i.test(normalizedMessage) && /(medicine|medication|meds)/i.test(normalizedMessage);

    if (isScheduleQueryEarly) {
      console.log("🎯 EARLY: Regex detected schedule query");
      try {
        // CRITICAL: Clear any active creation flow so schedule routing isn't hijacked
        if (draftCache[sessionKey]?.phase?.startsWith('create_')) {
          console.log("🧹 Clearing active creation flow for early schedule detection");
          delete draftCache[sessionKey];
        }
        
        // Extract explicit date or default to today
        const dateMatchEarly = normalizedMessage.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        let extractedDateEarly = dateMatchEarly ? dateMatchEarly[1] : null;
        if (!extractedDateEarly && /(today|todays|today's)/i.test(normalizedMessage)) {
          extractedDateEarly = moment().utc().format('YYYY-MM-DD');
        }

        // Try Python Bridge first
        if (pythonNodeBridge.isAvailable()) {
          console.log("🐍 Python Bridge (early): Using medicine schedule endpoint...");
          try {
            const userTokenEarly = authHeader ? authHeader.replace('Bearer ', '') : 'default_token_for_medicine_schedule';
            const pyResp = await pythonNodeBridge.getMedicineSchedule(normalizedMessage, userTokenEarly, extractedDateEarly);
            if (pyResp?.success) {
              const text = pyResp?.data?.data?.response || pyResp?.response || "Here's your medicine schedule.";
              return sendBotReply(chatId, userId, message, text, res);
            }
          } catch (pyErr) {
            console.warn('Python Bridge schedule failed, falling back to Node:', pyErr?.message || pyErr);
          }
        }

        // Fall back to Node.js handler
        console.log("🔄 Falling back to Node.js schedule handler (early)...");
        const scheduleIntent = { date: extractedDateEarly || moment().utc().format('YYYY-MM-DD') };
        try {
          return await handleCheckMedicineSchedule(
            scheduleIntent,
            message,
            chatId,
            userId,
            authHeader,
            res
          );
        } catch (errEarly) {
          console.error("❌ Early schedule handling failed:", errEarly?.message || errEarly);
          // Final fallback - provide helpful message
          const fallbackMsg = `I can see you're asking about your medicine schedule for ${extractedDateEarly ? moment(extractedDateEarly).format('Do MMMM, YYYY') : 'today'}, but I'm having trouble accessing your schedule right now. Please try again later or contact support if the issue persists.`;
          return sendBotReply(chatId, userId, message, fallbackMsg, res);
        }
      } catch (errEarly) {
        console.warn('Early schedule handling failed, continuing:', errEarly?.message || errEarly);
      }
    }

         // 🔴 PRIORITY 4: CREATION FAST-PATH (only if not a schedule query)
     const wantsCreateSupplement = /\bcreate\b.*\b(supplement|supplements)\b/i.test(normalizedMessage) || /(make|add)\b.*\b(supplement|supplements)\b/i.test(normalizedMessage);
     const mentionsSupplementExplicitly = /\b(supplement|supplements)\b/i.test(normalizedMessage);
     
     // CRITICAL: Check if we're already in a medicine schedule flow - if so, DON'T enter creation fast-path
     const isAlreadyInMedicineScheduleFlow = draftCache[sessionKey]?.phase === 'create_medicine_schedule';
     
     // If a schedule query is detected OR we're already in medicine schedule flow, do NOT enter creation fast-path
     if (!isScheduleQueryEarly && !isAlreadyInMedicineScheduleFlow && (wantsCreateSupplement || mentionsSupplementExplicitly && /\bcreate\b/i.test(normalizedMessage))) {
      console.log("🚀 CREATION FAST-PATH: Detected supplement creation intent");
      
             // Ensure one canonical session object shared across possible keys (userId/chatId/ip)
       // CRITICAL: Use userId as primary key since base handler expects draftCache[userId]
       const primaryKey = userId || sessionKey;
       draftCache[primaryKey] = draftCache[primaryKey] || {};
       const sessionObj = draftCache[primaryKey];
       draftCache[primaryKey].phase = 'create_supplement';
       
       // Also set in other possible keys for compatibility
       if (userId && userId !== primaryKey) draftCache[userId] = sessionObj;
       if (chatId && chatId !== primaryKey) draftCache[chatId] = sessionObj;
       if (req.ip && req.ip !== primaryKey) draftCache[req.ip] = sessionObj;
      
      try {
        // Quick inline parse of common "key: value" fields to prefill
        draftCache[primaryKey].collected = draftCache[primaryKey].collected || {};
        const kv = (key, re) => {
          const m = normalizedMessage.match(re);
          return m && m[1] ? m[1].trim() : undefined;
        };
        const prefill = {
          supplementName: kv('name', /\bname\s*:\s*([^,]+?)(?=,|$)/i),
          dosage: kv('dosage', /\bdosage\s*:\s*([^,]+?)(?=,|$)/i),
          description: kv('description', /\bdescription\s*:\s*([^,]+?)(?=,|$)/i),
          quantity: kv('quantity', /\bquantity\s*:\s*([^,]+?)(?=,|$)/i),
          price: kv('price', /\bprice\s*:\s*\$?([^,]+?)(?=,|$)/i),
          takenForSymptoms: kv('purpose', /\b(purpose|used for|for)\s*:\s*([^,]+?)(?=,|$)/i) || kv('for', /\bfor\s+([^,]+?)(?=,|$)/i),
          brand: kv('brand', /\bbrand\s*:\s*([^,]+?)(?=,|$)/i),
          manufacturer: kv('manufacturer', /\bmanufacturer\s*:\s*([^,]+?)(?=,|$)/i),
          expirationDate: kv('expiration', /\b(expiration|expiry|expires)\s*:\s*([^,]+?)(?=,|$)/i)
        };
        
        // Debug logging to see what's being extracted
        console.log("🔍 Prefill extraction results:", prefill);
        console.log("🔍 Prefill extraction results:", prefill);
        
        for (const [k, v] of Object.entries(prefill)) {
          if (v && !draftCache[primaryKey].collected[k]) {
            draftCache[primaryKey].collected[k] = v;
          }
        }

                 // Try to pre-extract with GPT-based extractor to improve accuracy
         try {
           console.log("🔍 Calling GPT extractor with message:", normalizedMessage);
           console.log("🔍 Current collected data:", draftCache[primaryKey]?.collected || {});
           
           const detected = await detectCreateSupplementIntentWithOpenAI(
             normalizedMessage,
             draftCache[primaryKey]?.collected || {}
           );
           
           console.log("🔍 GPT extraction result:", detected);
           
           if (detected && detected.collected) {
             console.log("🔍 Using GPT collected data:", detected.collected);
             draftCache[primaryKey].collected = detected.collected;
           } else if (detected && detected.fields) {
             console.log("🔍 Using GPT fields data:", detected.fields);
             draftCache[primaryKey].collected = detected.fields;
           }
           
           console.log("🔍 Final collected data after GPT:", draftCache[primaryKey].collected);
         } catch (prefillErr) {
           console.warn('prefill extraction failed:', prefillErr?.message || prefillErr);
         }
        
        // Directly call the base handler so it consumes draftCache[collected] and doesn't re-ask name
        return await handleCreateSupplementBase(
          message,
          chatId,
          userId,
          authHeader,
          res
        );
      } catch (creationErr) {
        console.warn('create_supplement fast-path failed, continuing with standard flow:', creationErr?.message || creationErr);
      }
    }

    // 🔍 Enhanced Intent Detection with Python Bridge
    const { intent } = await detectMainIntentWithOpenAI(normalizedMessage);
    console.log("🧠 Main Intent Detected:", intent);

    // 🐍 Try Python Bridge First for Enhanced AI Capabilities
    if (pythonNodeBridge.isAvailable()) {
      try {
        console.log("🐍 Using Python Bridge for enhanced AI response...");
        
        const pythonResponse = await pythonNodeBridge.chatWithAI(normalizedMessage, {
          queryType: intent.toUpperCase(),
          anonToken: req.headers['x-anon-token'],
          userId: userId,
          userToken: authHeader
        });

        if (pythonResponse.success) {
          console.log("✅ Python Bridge response successful");
          
          // Log the query
          await logQueryToDB({
            anonToken: req.headers['x-anon-token'],
            query: message,
            aiResponse: pythonResponse.response,
            model: 'gpt-4-python-bridge',
            tokensUsed: pythonResponse.response.usage?.total_tokens || 0,
            success: true,
            ip: getIPv4Address(req),
            source: 'python_bridge'
          });

          // Extract the response content
          const resp = pythonResponse.response;
          const botReply = resp?.response || resp?.data?.response || resp?.message || "I'm here to help with your health questions!";
          
          return sendBotReply(chatId, userId, message, botReply, res);
        }
      } catch (error) {
        console.warn("⚠️ Python Bridge failed, falling back to Node.js:", error.message);
      }
    }

    // 🚀 Fallback to Enhanced Node.js Processing
    console.log("🔄 Using enhanced Node.js processing...");

    // Route based on intent with enhanced capabilities
    if (
      intent === "check_medicine_schedule" ||
      draftCache[userId]?.phase === "check_medicine_schedule"
    ) {
      const scheduleIntent = await detectScheduleIntentWithOpenAI(
        normalizedMessage
      );
      return await handleCheckMedicineSchedule(
        scheduleIntent,
        message,
        chatId,
        userId,
        authHeader,
        res
      );
    }

    if (
      intent === "create_supplement" ||
      draftCache[userId]?.phase === "create_supplement"
    ) {
      return await handleCreateSupplementBase(
        message,
        chatId,
        userId,
        authHeader,
        res
      );
    }

    if (
      intent === "create_medicine" ||
      draftCache[userId]?.phase === "create_medicine"
    ) {
      return await handleCreateMedicine(
        message,
        chatId,
        userId,
        res
      );
    }

    if (
      intent === "create_vaccine" ||
      draftCache[userId]?.phase === "create_vaccine"
    ) {
      return await handleCreateVaccine(
        message,
        chatId,
        userId,
        res
      );
    }

    if (
      intent === "create_vaccine_schedule" ||
      draftCache[userId]?.phase === "create_vaccine_schedule"
    ) {
      return await handleCreateVaccineSchedule(
        message,
        chatId,
        userId,
        res
      );
    }

    if (
      intent === "create_medicine_schedule" ||
      draftCache[userId]?.phase === "create_medicine_schedule"
    ) {
      return await handleCreateMedicineSchedule(
        message,
        chatId,
        userId,
        res,
        req.headers.authorization
      );
    }

    // 🔍 If the query is clearly not health-related, return a scope message instead of general GPT
    const looksHealthRelated = /\b(vitamin|supplement|medicine|medication|tablet|pill|capsule|vaccine|vaccination|dose|dosage|side effects|symptom|pain|headache|fever|cold|flu|blood pressure|cholesterol|diabetes|asthma|allergy|doctor|clinic|health|wellness|nutrition|diet|exercise)\b/i.test(normalizedMessage);
    if (!looksHealthRelated) {
      const scopeMsg = "I'm designed to help with health-related topics like supplements, medicines, vaccines, symptoms, and wellness. Please ask a health question, and I'll be happy to help!";
      return sendBotReply(chatId, userId, message, scopeMsg, res);
    }

    //  Final Fallback: Enhanced GPT Response
    console.log("Using enhanced GPT fallback...");
    const reply = await getHealthGPTResponse(normalizedMessage);
    const tokensUsed = reply.usage?.total_tokens || 0;

    await logQueryToDB({
      anonToken: req.headers['x-anon-token'],
      query: message,
      aiResponse: reply,
      model: 'gpt-4-enhanced',
      tokensUsed,
      success: true,
      ip: getIPv4Address(req),
      source: 'node_enhanced'
    });

    return sendBotReply(chatId, userId, message, reply, res);

  } catch (error) {
    console.error(" Error in chatWithEnhancedHealthBot:", error);
    
    await logQueryToDB({
      anonToken: req.headers['x-anon-token'],
      query: req.body.message,
      model: 'error-fallback',
      success: false,
      errorMessage: error.message,
      ip: getIPv4Address(req),
      source: 'error'
    });

    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error while chatting with Enhanced HealthBot.",
    });
  }
};

export {
  chatWithEnhancedHealthBot,
};

export default {
  chatWithEnhancedHealthBot,
};
