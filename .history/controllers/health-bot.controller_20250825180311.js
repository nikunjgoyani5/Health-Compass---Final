import { StatusCodes } from "http-status-codes";
import axios from "axios";
import config from "../config/config.js";
import moment from "moment";
import {
  getHealthGPTResponse,
  detectScheduleIntentWithOpenAI,
  detectMainIntentWithOpenAI,
  detectVaccineIntentWithOpenAI,
  normalizeUserInput,
  detectCreateMedicineScheduleIntentWithOpenAI,
  detectCreateVaccineScheduleIntentWithOpenAI,
  detectCreateVaccineIntentWithOpenAI,
  detectCreateSupplementIntentWithOpenAI,
  detectCreateHealthRecordIntentWithOpenAI,
} from "../utils/gpt.utils.js";
import { apiResponse } from "../helper/api-response.helper.js";
import ChatHistory from "../models/chatHistory.model.js";
import { transcribeAudio } from "../utils/speech-to-text.utils.js";
import stringSimilarity from "string-similarity";
import {logQueryToDB} from "../services/aiQuery-log.service.js";
import {getIPv4Address} from "../helper/common.helper.js";

const draftCache = {};
// 🗂 In-memory session message store to keep recent chat turns per session
// Structure: { [sessionId: string]: Array<{ role: 'user'|'assistant', content: string }> }
const sessionMessages = {};

function appendSessionMessage(sessionId, role, content) {
  if (!sessionId) return;
  sessionMessages[sessionId] = sessionMessages[sessionId] || [];
  sessionMessages[sessionId].push({ role, content });
  // Keep only the last 40 turns to bound memory
  if (sessionMessages[sessionId].length > 40) {
    sessionMessages[sessionId] = sessionMessages[sessionId].slice(-40);
  }
}

function convertTo12HourWithAmPm(timeStr) {
  const [hourStr, minuteStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) return timeStr;

  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

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

const chatWithHealthBot = async (req, res) => {
  try {
    console.log({reqIp: req.ip});
    let { message, chatId, audioUrl } = req.body;
    const userId = req.user?._id;
    const sessionId = userId || req.body?.chatId || req.headers['x-anon-token'] || req.ip;
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

    const cacheKey = `${sessionId}_health_score`;
    if (
      draftCache[cacheKey] &&
      Object.keys(draftCache[cacheKey].answers).length < 10
    ) {
      // User is in the middle of health score assessment, skip intent detection
      return await handleCreateHealthScore(
        message,
        chatId,
        sessionId,
        authHeader,
        res
      );
    }

    // Build conversation history for intent detection (ensures context continuity)
    const existing = chatId ? await ChatHistory.findById(chatId).lean() : null;
    const priorDb = (existing?.messages || []).map((m) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.message,
    }));
    const priorMem = sessionMessages[sessionId] || [];
    const prior = [...priorDb, ...priorMem];
    const intentHistory = [...prior, { role: "user", content: normalizedMessage }];
    const { intent } = await detectMainIntentWithOpenAI(intentHistory);

    // 🔒 Heuristic: If last assistant message was asking for creation fields, keep/create supplement phase
    const lastAssistant = [...prior].reverse().find((m) => m.role === "assistant");
    const creationFieldHints = [
      "what's the dosage",
      "what is the dosage",
      "dosage",
      "what's the name",
      "what is the name",
      "what's the name of the medicine",
      "what is the name of the medicine",
      "name of the medicine",
      "medicine name",
      "price",
      "quantity",
      "manufacture date",
      "expiry date",
      "single pack",
      "description",
    ];
    if (lastAssistant) {
      const askedCreation = creationFieldHints.some((k) =>
        (lastAssistant.content || "").toLowerCase().includes(k)
      );
      if (askedCreation) {
        // Force/keep creation phase
        draftCache[sessionId] = draftCache[sessionId] || { phase: "create_supplement", collected: {} };
        draftCache[sessionId].phase = "create_supplement";
      }
    }
    console.log("🧠 Main Intent Detected:", intent);

    // Route based on intent
    if (
      intent === "check_medicine_schedule" ||
      draftCache[sessionId]?.phase === "check_medicine_schedule"
    ) {
      const scheduleIntent = await detectScheduleIntentWithOpenAI(
        normalizedMessage
      );
      return await handleCheckMedicineSchedule(
        scheduleIntent,
        message,
        chatId,
        sessionId,
        authHeader,
        res
      );
    }

    if (
      intent === "check_vaccine_schedule" ||
      draftCache[sessionId]?.phase === "check_vaccine_schedule"
    ) {
      const vaccineIntent = await detectVaccineIntentWithOpenAI(
        normalizedMessage
      );
      return await handleCheckVaccineSchedule(
        vaccineIntent,
        message,
        chatId,
        sessionId,
        authHeader,
        res
      );
    }

    // ✅ 3. Create medicine schedule
    if (
      intent === "create_medicine_schedule" ||
      draftCache[sessionId]?.phase === "create_medicine_schedule"
    ) {
      const medicineScheduleIntent =
        await detectCreateMedicineScheduleIntentWithOpenAI(
          normalizedMessage,
          draftCache[sessionId]?.collected || {}
        );
      return await handleCreateMedicineSchedule(
        message,
        chatId,
        sessionId,
        authHeader,
        res,
        medicineScheduleIntent
      );
    }

    // ✅ 4. Create vaccine schedule
    if (
      intent === "create_vaccine_schedule" ||
      draftCache[sessionId]?.phase === "create_vaccine_schedule"
    ) {
      const vaccineScheduleIntent =
        await detectCreateVaccineScheduleIntentWithOpenAI(
          normalizedMessage,
          draftCache[sessionId]?.collected || {}
        );
      return await handleCreateVaccineSchedule(
        message,
        chatId,
        sessionId,
        authHeader,
        res,
        vaccineScheduleIntent
      );
    }

    if (
      intent === "create_vaccine" ||
      draftCache[sessionId]?.phase === "create_vaccine"
    ) {
      return await handleCreateVaccine(
        message,
        chatId,
        sessionId,
        authHeader,
        res
      );
    }

    // ✅ Treat "create_medicine" as supplement creation flow (same data model/API)
    if (
      intent === "create_medicine" ||
      draftCache[sessionId]?.phase === "create_medicine" ||
      draftCache[sessionId]?.phase === "create_supplement"
    ) {
      return await handleCreateSupplement(
        message,
        chatId,
        sessionId,
        authHeader,
        res
      );
    }

    if (
      intent === "create_supplement" ||
      draftCache[sessionId]?.phase === "create_supplement" ||
      draftCache[sessionId]?.phase === "create_medicine"
    ) {
      return await handleCreateSupplement(
        message,
        chatId,
        sessionId,
        authHeader,
        res
      );
    }

    // Generate health scores
    if (
      intent === "generate_health_score" ||
      draftCache[sessionId]?.phase === "generate_health_score"
    ) {
      return await handleCreateHealthScore(
        message,
        chatId,
        sessionId,
        authHeader,
        res
      );
    }

    // Fallback for general questions with conversation context
    const chatData = chatId ? await ChatHistory.findById(chatId).lean() : null;
    const historyDb = (chatData?.messages || []).map((m) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.message,
    }));
    const historyMem = sessionMessages[sessionId] || [];
    const history = [...historyDb, ...historyMem, { role: "user", content: message }];
    const reply = await getHealthGPTResponse(history);
    // Append to in-memory session messages
    appendSessionMessage(sessionId, "user", message);
    appendSessionMessage(sessionId, "assistant", reply);
    const tokensUsed = reply.usage?.total_tokens || 0;

    await logQueryToDB({
      anonToken: req.headers['x-anon-token'],
      query: message,
      aiResponse: reply,
      model: 'gpt-4',
      tokensUsed,
      success: true,
      ip: getIPv4Address(req),
    });

    return sendBotReply(chatId,sessionId,message,reply,res);
  } catch (error) {
    console.error("❌ Error in chatWithHealthBot:",error);
    await logQueryToDB({
      anonToken: req.headers['x-anon-token'],
      query: req.body.message,
      model: 'gpt-4',
      success: false,
      errorMessage: error.message,
      ip: getIPv4Address(req),
    });

    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Internal server error while chatting with HealthBot.",
    });
  }
};

const handleCheckMedicineSchedule = async (
  scheduleIntent,
  message,
  chatId,
  userId,
  authHeader,
  res
) => {
  try {
    const doseRes = await axios.get(
      `${config.base_url}/api/v1/medicine-schedule/get-doses-by-date?date=${scheduleIntent.date}`,
      { headers: { Authorization: authHeader } }
    );
    const doses = doseRes.data?.body || [];
    const readableDate = moment(scheduleIntent.date).format("Do MMMM, YYYY");

    if (doses.length === 0) {
      return sendBotReply(
        chatId,
        userId,
        message,
        `You don't have any medicines scheduled on ${readableDate}.`,
        res
      );
    }

    const gptPrompt = `
You are HealthBot. The user asked: "${message}"
Here is their medicine schedule for ${readableDate}:
${JSON.stringify(doses, null, 2)}
Reply with:
- ✅ Confirmed dose list
- Dose times
- Use emojis & clean formatting.`;

    const botReply = await getHealthGPTResponse(gptPrompt);
    return sendBotReply(chatId, userId, message, botReply, res);
  } catch (err) {
    console.error("❌ Error fetching medicine schedule:", err);
    return sendBotReply(
      chatId,
      userId,
      message,
      "Unable to fetch medicine schedule.",
      res
    );
  }
};

const handleCheckVaccineSchedule = async (
  vaccineIntent,
  message,
  chatId,
  userId,
  authHeader,
  res
) => {
  try {
    const vacRes = await axios.get(
      `${config.base_url}/api/v1/vaccine-schedule/by-date?date=${vaccineIntent.date}`,
      { headers: { Authorization: authHeader } }
    );
    const vaccines = vacRes?.data?.body || [];
    const readableDate = moment(vaccineIntent.date).format("Do MMMM, YYYY");

    if (vaccines.length === 0) {
      return sendBotReply(
        chatId,
        userId,
        message,
        `You don't have any vaccinations scheduled on ${readableDate}.`,
        res
      );
    }

    const gptPrompt = `
You are HealthBot. The user asked: "${message}"
Here is their vaccine schedule for ${readableDate}:
${JSON.stringify(vaccines, null, 2)}
Reply with bullet points and simple times.`;

    const reply = await getHealthGPTResponse(gptPrompt);
    return sendBotReply(chatId, userId, message, reply, res);
  } catch (err) {
    console.error("❌ Vaccine fetch error:", err);
    return sendBotReply(
      chatId,
      userId,
      message,
      "Unable to fetch vaccination schedule.",
      res
    );
  }
};

// const handleCreateVaccineSchedule = async (
//   message,
//   chatId,
//   userId,
//   authHeader,
//   res
// ) => {
//   try {
//     const chatData = await ChatHistory.findById(chatId).lean();
//     const messageHistory = [
//       ...(chatData?.messages || []),
//       { role: "user", message },
//     ];

//     const createIntent = await detectCreateVaccineScheduleIntentWithOpenAI(
//       messageHistory,
//       draftCache[userId]?.collected || {}
//     );

//     // 🧠 Exit condition handling
//     if (
//       draftCache[userId]?.phase === "create_vaccine_schedule" &&
//       createIntent.nextStep === "exit"
//     ) {
//       const userReply = message.toLowerCase();
//       const priorMessage = messageHistory
//         .reverse()
//         .find((msg) => msg.role === "user" && msg.message !== message);
//       const fallbackMessage = priorMessage?.message || message;

//       if (/^(yes|cancel|haan|exit|stop|cancel kardo)/i.test(userReply)) {
//         delete draftCache[userId];
//         return await getSafeFallbackReply(
//           chatId,
//           userId,
//           message,
//           fallbackMessage,
//           res,
//           "create_vaccine_schedule"
//         );
//       }

//       if (
//         /^(no|mat cancel|continue|rakho|don’t stop|keep going)/i.test(userReply)
//       ) {
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           "👍 Great, let's continue with vaccine scheduling.",
//           res
//         );
//       }

//       return sendBotReply(
//         chatId,
//         userId,
//         message,
//         createIntent.ask || "Should I cancel vaccine scheduling?",
//         res
//       );
//     }

//     // 🧠 Update draft cache
//     draftCache[userId] = {
//       phase: "create_vaccine_schedule",
//       collected: {
//         ...draftCache[userId]?.collected,
//         ...createIntent.collected,
//       },
//     };

//     const { vaccineName, vaccineId, date, doseTime } =
//       draftCache[userId].collected;

//     // 🔍 Resolve vaccine name to ID
//     if (vaccineName && !vaccineId && !draftCache[userId].validatedVaccine) {
//       const vacRes = await axios.get(`${config.base_url}/api/v1/vaccine`, {
//         headers: { Authorization: authHeader },
//       });
//       const vaccines = vacRes?.data?.body || [];
//       const match = vaccines.find(
//         (v) => v.vaccineName.toLowerCase() === vaccineName.toLowerCase()
//       );

//       if (!match) {
//         const list = vaccines.map((v) => `💉 ${v.vaccineName}`).join("\n");
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           `😕 I couldn’t find a vaccine named **"${vaccineName}"**.\nHere are your available vaccines:\n\n${list}\n\n👉 Please reply with one of the names above.`,
//           res
//         );
//       }

//       draftCache[userId].collected.vaccineId = match._id;
//       draftCache[userId].validatedVaccine = match;
//       delete draftCache[userId].collected.vaccineName;
//     }

//     // ✅ 4. If GPT says "done" & all fields are available → Auto-save
//     if (
//       createIntent?.nextStep === "done" &&
//       draftCache[userId].collected?.vaccineId &&
//       date &&
//       doseTime
//     ) {
//       const payload = {
//         vaccineId: draftCache[userId].collected.vaccineId,
//         date,
//         doseTime,
//       };

//       try {
//         const saveRes = await axios.post(
//           `${config.base_url}/api/v1/vaccine-schedule`,
//           payload,
//           { headers: { Authorization: authHeader } }
//         );

//         delete draftCache[userId];
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           `✅ ${
//             saveRes?.data?.message ||
//             "Your vaccine schedule has been saved successfully!"
//           }`,
//           res
//         );
//       } catch (err) {
//         const errorMsg = err?.response?.data?.message || "";
//         console.error("❌ Error saving vaccine schedule:", errorMsg);

//         if (errorMsg.includes("already schedule")) {
//           return sendBotReply(
//             chatId,
//             userId,
//             message,
//             `⚠️ You've already scheduled this vaccine for the same time.\nTry a different date/time.`,
//             res
//           );
//         }

//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           `⚠️ I wasn't able to save your schedule right now. Please try again later.`,
//           res
//         );
//       }
//     }

//     return sendBotReply(chatId, userId, message, createIntent.ask, res);
//   } catch (err) {
//     console.error("❌ Error in handleCreateVaccineSchedule:", err);
//     return sendBotReply(
//       chatId,
//       userId,
//       message,
//       "⚠️ Something went wrong while helping you schedule the vaccine. Let's try again.",
//       res
//     );
//   }
// };

const handleCreateVaccineSchedule = async (
  message,
  chatId,
  userId,
  authHeader,
  res
) => {
  try {
    const chatData = await ChatHistory.findById(chatId).lean();
    const messageHistory = [
      ...(chatData?.messages || []),
      { role: "user", message },
    ];

    // 🔄 Clear previous draft if phase is different
    if (draftCache[userId]?.phase !== "create_vaccine_schedule") {
      delete draftCache[userId];
    }

    const userReply = message.toLowerCase();

    // ✅ Confirm suggested date if user says "yes"
    if (
      draftCache[userId]?.phase === "create_vaccine_schedule" &&
      draftCache[userId]?.suggestedDate &&
      /^(yes|haan|sahi|correct|thik hai)$/i.test(userReply)
    ) {
      draftCache[userId].collected.date = draftCache[userId].suggestedDate;
      delete draftCache[userId].suggestedDate;
    }

    const createIntent = await detectCreateVaccineScheduleIntentWithOpenAI(
      messageHistory,
      draftCache[userId]?.collected || {}
    );

    // 🛑 Exit check
    if (
      draftCache[userId]?.phase === "create_vaccine_schedule" &&
      createIntent.nextStep === "exit"
    ) {
      const priorMessage = messageHistory
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "user");

      const fallbackMessage = priorMessage?.message || message;

      if (/^(yes|haan|cancel|nikal|exit|stop|cancel kardo)/i.test(userReply)) {
        delete draftCache[userId];
        return await getSafeFallbackReply(
          chatId,
          userId,
          message,
          fallbackMessage,
          res,
          "create_vaccine_schedule"
        );
      }

      if (/^(no|continue|mat cancel|rakho|keep going)/i.test(userReply)) {
        return sendBotReply(
          chatId,
          userId,
          message,
          "👍 Great, let's continue with your vaccine schedule.",
          res
        );
      }

      return sendBotReply(
        chatId,
        userId,
        message,
        createIntent.ask || "❓ Should I cancel vaccine scheduling?",
        res
      );
    }

    // 💾 Update draft
    draftCache[userId] = {
      phase: "create_vaccine_schedule",
      collected: {
        ...draftCache[userId]?.collected,
        ...createIntent.collected,
      },
    };

    // ✅ Clear suggestion if a proper date is now collected
    if (createIntent.collected?.date) {
      delete draftCache[userId].suggestedDate;
    }

    const { vaccineName, vaccineId, date, doseTime } =
      draftCache[userId].collected;

    // 🎯 Vaccine fuzzy matching
    if (vaccineName && !vaccineId && !draftCache[userId].validatedVaccine) {
      const vacRes = await axios.get(`${config.base_url}/api/v1/vaccine`, {
        headers: { Authorization: authHeader },
      });

      const vaccines = vacRes?.data?.body || [];
      const availableNames = vaccines.map((v) => v.vaccineName);
      const bestMatch = stringSimilarity.findBestMatch(
        vaccineName,
        availableNames
      ).bestMatch;

      if (bestMatch.rating >= 0.7) {
        const match = vaccines.find((v) => v.vaccineName === bestMatch.target);
        draftCache[userId].collected.vaccineId = match._id;
        draftCache[userId].validatedVaccine = match;
        delete draftCache[userId].collected.vaccineName;
      } else {
        const list = vaccines.map((v) => `💉 ${v.vaccineName}`).join("\n");
        return sendBotReply(
          chatId,
          userId,
          message,
          `😕 I couldn’t find a vaccine named **"${vaccineName}"**.\nHere are your available vaccines:\n\n${list}\n\n👉 Please reply with one of the names above.`,
          res
        );
      }
    }

    // ⏰ Vague doseTime check
    const isVagueTime = (text = "") => {
      const lower = text.toLowerCase();
      const vaguePhrases = [
        "evening",
        "morning",
        "noon",
        "night",
        "afternoon",
        "just past",
        "after",
        "before",
      ];
      return vaguePhrases.some((p) => lower.includes(p));
    };

    if (doseTime && isVagueTime(doseTime)) {
      draftCache[userId].collected.doseTime = undefined;
      return sendBotReply(
        chatId,
        userId,
        message,
        "⏰ Please provide a more specific time like '6:00 PM' or '10:30 AM'.",
        res
      );
    }

    // 🕒 Normalize doseTime
    const fixedDoseTime = (() => {
      if (!doseTime || typeof doseTime !== "string") return undefined;

      let timeStr = doseTime.trim().toUpperCase();

      // Convert dots to colons: 6.03 PM → 6:03 PM
      timeStr = timeStr.replace(/(\d{1,2}).(\d{1,2})/, "$1:$2");

      // If only hour and AM/PM: 6 PM → 6:00 PM
      if (/^\d{1,2}\s?(AM|PM)$/.test(timeStr)) {
        return timeStr.replace(/\s?(AM|PM)/, ":00 $1");
      }

      // If valid "h:mm AM/PM" format now
      if (/^\d{1,2}:\d{2}\s?(AM|PM)$/.test(timeStr)) {
        return timeStr.replace(/\s?(AM|PM)/, " $1");
      }

      return timeStr;
    })();

    // ✅ Final auto-save
    if (
      createIntent.nextStep === "done" &&
      draftCache[userId].collected.vaccineId &&
      date &&
      fixedDoseTime
    ) {
      try {
        const payload = {
          vaccineId: draftCache[userId].collected.vaccineId,
          date,
          doseTime: fixedDoseTime,
        };

        const saveRes = await axios.post(
          `${config.base_url}/api/v1/vaccine-schedule`,
          payload,
          { headers: { Authorization: authHeader } }
        );

        delete draftCache[userId];
        return sendBotReply(
          chatId,
          userId,
          message,
          `✅ ${saveRes?.data?.message || "Your vaccine schedule is saved!"}`,
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("❌ Error saving vaccine schedule:", errorMsg);

        if (errorMsg.includes("already schedule")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            "⚠️ You’ve already scheduled this vaccine for the same time. Try a different date/time.",
            res
          );
        }

        return sendBotReply(
          chatId,
          userId,
          message,
          "⚠️ I wasn’t able to save your schedule. Please try again later.",
          res
        );
      }
    }

    return sendBotReply(chatId, userId, message, createIntent.ask, res);
  } catch (err) {
    console.error("❌ Error in handleCreateVaccineSchedule:", err);
    return sendBotReply(
      chatId,
      userId,
      message,
      "⚠️ Something went wrong while helping you schedule the vaccine. Let’s try again.",
      res
    );
  }
};

// const handleCreateMedicineSchedule = async (
//   message,
//   chatId,
//   userId,
//   authHeader,
//   res
// ) => {
//   try {
//     const chatData = await ChatHistory.findById(chatId).lean();
//     const messageHistory = [
//       ...(chatData?.messages || []),
//       { role: "user", message },
//     ];

//     const createIntent = await detectCreateMedicineScheduleIntentWithOpenAI(
//       messageHistory,
//       draftCache[userId]?.collected || {}
//     );

//     // 🧠 Handle topic switch
//     if (
//       draftCache[userId]?.phase === "create_medicine_schedule" &&
//       createIntent.nextStep === "exit"
//     ) {
//       const userReply = message.toLowerCase();
//       const previousMessage = messageHistory
//         .slice()
//         .reverse()
//         .find((msg) => msg.role === "user" && msg.message !== message);

//       const fallbackMessage = previousMessage?.message || message;

//       if (/^(yes|cancel|exit|haan|stop|cancel kardo)/i.test(userReply)) {
//         delete draftCache[userId];
//         return await getSafeFallbackReply(
//           chatId,
//           userId,
//           message,
//           fallbackMessage,
//           res,
//           "create_medicine_schedule"
//         );
//       }

//       if (
//         /^(no|continue|rakho|mat cancel|don’t stop|keep going)/i.test(userReply)
//       ) {
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           "👍 Great, let’s continue scheduling your medicine.",
//           res
//         );
//       }

//       return sendBotReply(
//         chatId,
//         userId,
//         message,
//         createIntent.ask ||
//           "Would you like to cancel medicine schedule creation?",
//         res
//       );
//     }

//     // 🧠 Update draft
//     draftCache[userId] = {
//       phase: "create_medicine_schedule",
//       collected: {
//         ...draftCache[userId]?.collected,
//         ...createIntent.collected,
//       },
//     };
//     console.log(" 🧠 Draft cache: 22222222222222222 ", draftCache[userId]);

//     const collected = draftCache[userId].collected;

//     // 🔍 Validate medicine name
//     if (collected.medicineName && !draftCache[userId].validatedSupplement) {
//       const medRes = await axios.get(
//         `${config.base_url}/api/v1/supplement/list`,
//         {
//           headers: { Authorization: authHeader },
//         }
//       );

//       const supplements = medRes?.data?.body?.supplements || [];
//       const inputName = collected.medicineName.toLowerCase();

//       const match = supplements.find(
//         (s) => s.medicineName.toLowerCase() === inputName
//       );

//       if (!match) {
//         const options = supplements
//           .map((s) => `💊 ${s.medicineName}`)
//           .join("\n");
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           `⚠️ I couldn't find any medicine named **\"${inputName}\"** in your list.\n\nHere are your available medicines:\n\n${options}\n\n👉 Please reply with one of the above names.`,
//           res
//         );
//       }

//       draftCache[userId].validatedSupplement = match;
//       draftCache[userId].collected.medicineName = match.medicineName;
//     }

//     // 🧮 Calculate required quantity and check
//     if (
//       collected.startDate &&
//       collected.endDate &&
//       collected.totalDosesPerDay &&
//       draftCache[userId]?.validatedSupplement?.quantity !== undefined
//     ) {
//       const start = new Date(collected.startDate);
//       const end = new Date(collected.endDate);
//       const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
//       const requiredQty = days * collected.totalDosesPerDay;
//       const availableQty = draftCache[userId].validatedSupplement.quantity;

//       if (requiredQty > availableQty) {
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           `⚠️ You need ${requiredQty} units of this medicine for the schedule, but you only have ${availableQty}.\nPlease reduce the duration or update the supplement quantity.`,
//           res
//         );
//       }
//     }

//     // ✅ Auto-save
//     if (
//       createIntent.nextStep === "done" &&
//       draftCache[userId]?.validatedSupplement?._id &&
//       collected.startDate &&
//       collected.endDate
//     ) {
//       const payload = {
//         ...collected,
//         medicineName: draftCache[userId].validatedSupplement._id,
//       };

//       try {
//         await axios.post(
//           `${config.base_url}/api/v1/medicine-schedule`,
//           payload,
//           {
//             headers: { Authorization: authHeader },
//           }
//         );

//         delete draftCache[userId];
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           "✅ Medicine schedule created successfully!",
//           res
//         );
//       } catch (err) {
//         const errorMsg = err?.response?.data?.message || "";
//         console.error("❌ Error saving medicine schedule:", errorMsg);

//         if (errorMsg.includes("already exists")) {
//           return sendBotReply(
//             chatId,
//             userId,
//             message,
//             "⚠️ A schedule already exists for this medicine and time period.\nPlease try a different date.",
//             res
//           );
//         }

//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           "⚠️ I wasn’t able to save your schedule. Please try again later.",
//           res
//         );
//       }
//     }

//     return sendBotReply(chatId, userId, message, createIntent.ask, res);
//   } catch (error) {
//     console.error("❌ Error in handleCreateMedicineSchedule:", error);
//     return sendBotReply(
//       chatId,
//       userId,
//       message,
//       "⚠️ Something went wrong while processing your medicine schedule. Please try again.",
//       res
//     );
//   }
// };

const handleCreateMedicineSchedule = async (
  message,
  chatId,
  userId,
  authHeader,
  res
) => {
  try {
    const chatData = await ChatHistory.findById(chatId).lean();
    const messageHistory = [
      ...(chatData?.messages || []),
      { role: "user", message },
    ];

    if (draftCache[userId]?.phase !== "create_medicine_schedule") {
      delete draftCache[userId];
    }

    const userReply = message.toLowerCase();

    const createIntent = await detectCreateMedicineScheduleIntentWithOpenAI(
      messageHistory,
      draftCache[userId]?.collected || {}
    );

    if (
      draftCache[userId]?.phase === "create_medicine_schedule" &&
      createIntent.nextStep === "exit"
    ) {
      const priorMessage = messageHistory
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "user");

      const fallbackMessage = priorMessage?.message || message;

      if (/^(yes|cancel|exit|haan|stop|cancel kardo)/i.test(userReply)) {
        delete draftCache[userId];
        return await getSafeFallbackReply(
          chatId,
          userId,
          message,
          fallbackMessage,
          res,
          "create_medicine_schedule"
        );
      }

      if (/^(no|continue|rakho|mat cancel|keep going)/i.test(userReply)) {
        return sendBotReply(
          chatId,
          userId,
          message,
          "👍 Great, let’s continue scheduling your medicine.",
          res
        );
      }

      return sendBotReply(
        chatId,
        userId,
        message,
        createIntent.ask ||
          "Would you like to cancel medicine schedule creation?",
        res
      );
    }

    draftCache[userId] = {
      phase: "create_medicine_schedule",
      collected: {
        ...draftCache[userId]?.collected,
        ...createIntent.collected,
      },
    };

    const collected = draftCache[userId].collected;

    if (collected.medicineName && !draftCache[userId].validatedSupplement) {
      const medRes = await axios.get(
        `${config.base_url}/api/v1/supplement/list`,
        { headers: { Authorization: authHeader } }
      );

      const supplements = medRes?.data?.body?.supplements || [];
      const inputName = collected.medicineName.toLowerCase();

      const match = supplements.find(
        (s) => s.medicineName.toLowerCase() === inputName
      );

      if (!match) {
        const options = supplements
          .map((s) => `💊 ${s.medicineName}`)
          .join("\n");
        return sendBotReply(
          chatId,
          userId,
          message,
          `⚠️ I couldn't find any medicine named **\"${inputName}\"** in your list.\n\nHere are your available medicines:\n\n${options}\n\n👉 Please reply with one of the above names.`,
          res
        );
      }

      draftCache[userId].validatedSupplement = match;
      draftCache[userId].collected.medicineName = match.medicineName;
    }

    // Quantity check logic
    if (
      collected.startDate &&
      collected.endDate &&
      collected.totalDosesPerDay &&
      draftCache[userId]?.validatedSupplement?.quantity !== undefined
    ) {
      const start = new Date(collected.startDate);
      const end = new Date(collected.endDate);
      const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
      const requiredQty = days * collected.totalDosesPerDay;
      const availableQty = draftCache[userId].validatedSupplement.quantity;

      if (requiredQty > availableQty) {
        return sendBotReply(
          chatId,
          userId,
          message,
          `⚠️ You need ${requiredQty} units but only ${availableQty} are available. Please reduce duration or update stock.`,
          res
        );
      }
    }

    if (
      createIntent.nextStep === "done" &&
      draftCache[userId]?.validatedSupplement?._id &&
      collected.startDate &&
      collected.endDate
    ) {
      // 🕒 Normalize doseTimes to 12-hour format with AM/PM
      if (Array.isArray(collected.doseTimes)) {
        collected.doseTimes = collected.doseTimes.map((t) =>
          /[a-zA-Z]/.test(t) ? t : convertTo12HourWithAmPm(t)
        );
      }

      // 🧮 Auto-calculate quantity before saving
      if (
        collected.startDate &&
        collected.endDate &&
        collected.totalDosesPerDay &&
        !collected.quantity
      ) {
        const start = new Date(collected.startDate);
        const end = new Date(collected.endDate);
        const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        collected.quantity = days * collected.totalDosesPerDay;
      }

      const payload = {
        ...collected,
        medicineName: draftCache[userId].validatedSupplement._id,
      };

      try {
        await axios.post(
          `${config.base_url}/api/v1/medicine-schedule`,
          payload,
          { headers: { Authorization: authHeader } }
        );

        delete draftCache[userId];
        return sendBotReply(
          chatId,
          userId,
          message,
          "✅ Medicine schedule created successfully!",
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("❌ Error saving medicine schedule:", errorMsg);

        if (errorMsg.includes("already exists")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            "⚠️ Schedule already exists for this time. Try a different date.",
            res
          );
        }

        return sendBotReply(
          chatId,
          userId,
          message,
          "⚠️ Could not save your schedule. Please try again later.",
          res
        );
      }
    }

    return sendBotReply(chatId, userId, message, createIntent.ask, res);
  } catch (error) {
    console.error("❌ Error in handleCreateMedicineSchedule:", error);
    return sendBotReply(
      chatId,
      userId,
      message,
      "⚠️ Something went wrong. Please try again.",
      res
    );
  }
};

const handleCreateVaccine = async (
  message,
  chatId,
  userId,
  authHeader,
  res
) => {
  try {
    const chatData = await ChatHistory.findById(chatId).lean();
    const messageHistory = [
      ...(chatData?.messages || []),
      { role: "user", message },
    ];

    // 🔄 Clear previous draft if phase is different
    if (draftCache[userId]?.phase !== "create_vaccine") {
      delete draftCache[userId];
    }

    const createIntent = await detectCreateVaccineIntentWithOpenAI(
      messageHistory,
      draftCache[userId]?.collected || {}
    );

    // 🛑 Handle topic switch (exit intent)
    if (
      draftCache[userId]?.phase === "create_vaccine" &&
      createIntent.nextStep === "exit"
    ) {
      const cancelMessage = message.toLowerCase();
      const fallbackMessage =
        [...messageHistory]
          .reverse()
          .find((msg) => msg.role === "user" && msg.message !== message)
          ?.message || message;

      if (
        /^(yes|cancel|haan|cancel kardo|yes cancel|exit|stop|haan cancel)/i.test(
          cancelMessage
        )
      ) {
        delete draftCache[userId];
        return await getSafeFallbackReply(
          chatId,
          userId,
          message,
          fallbackMessage,
          res,
          "create_vaccine"
        );
      }

      if (
        /^(no|continue|mat cancel|don’t cancel|keep going|nahi|continue rakho)/i.test(
          cancelMessage
        )
      ) {
        return sendBotReply(
          chatId,
          userId,
          message,
          "👍 Got it! Let's continue. " +
            (draftCache[userId]?.collected?.vaccineName &&
            !draftCache[userId]?.collected?.provider
              ? "Who is the provider of the vaccine?"
              : "What is the name of the vaccine you want to add?"),
          res
        );
      }

      return sendBotReply(
        chatId,
        userId,
        message,
        createIntent.ask || "Would you like to cancel the vaccine creation?",
        res
      );
    }

    // 🧠 Update draft cache
    draftCache[userId] = {
      phase: "create_vaccine",
      collected: {
        ...draftCache[userId]?.collected,
        ...createIntent.collected,
      },
    };

    const { vaccineName, provider, description } = draftCache[userId].collected;

    // ✅ If required fields are filled, call API
    if (vaccineName && provider) {
      const payload = {
        vaccineName,
        provider,
        ...(description ? { description } : {}),
      };

      try {
        await axios.post(`${config.base_url}/api/v1/vaccine`, payload, {
          headers: { Authorization: authHeader },
        });

        delete draftCache[userId];

        return sendBotReply(
          chatId,
          userId,
          message,
          `✅ Vaccine "${payload.vaccineName}" has been added successfully.`,
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("❌ Error creating vaccine:", errorMsg);

        if (errorMsg.toLowerCase().includes("already exist")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            `⚠️ Vaccine "${vaccineName}" already exists in your records.`,
            res
          );
        }

        return sendBotReply(
          chatId,
          userId,
          message,
          `⚠️ Failed to create the vaccine. Please try again later.`,
          res
        );
      }
    }

    // ⏭ Ask for next field if required fields aren't ready
    return sendBotReply(chatId, userId, message, createIntent.ask, res);
  } catch (err) {
    console.error("❌ Error in handleCreateVaccine:", err);
    return sendBotReply(
      chatId,
      userId,
      message,
      "⚠️ Something went wrong. Please try again later.",
      res
    );
  }
};

// const handleCreateSupplement = async (
//   message,
//   chatId,
//   userId,
//   authHeader,
//   res
// ) => {
//   try {
//     const chatData = await ChatHistory.findById(chatId).lean();
//     const messageHistory = [
//       ...(chatData?.messages || []),
//       { role: "user", message },
//     ];

//     const supplementIntent = await detectCreateSupplementIntentWithOpenAI(
//       messageHistory,
//       draftCache[userId]?.collected || {}
//     );

//     if (
//       draftCache[userId]?.phase === "create_supplement" &&
//       supplementIntent.nextStep === "exit"
//     ) {
//       const userReply = message.toLowerCase();
//       const priorMessage = messageHistory
//         .slice()
//         .reverse()
//         .find((msg) => msg.role === "user" && msg.message !== message);
//       const fallbackMessage = priorMessage?.message || message;

//       if (/^(yes|cancel|haan|cancel kardo|exit|stop)/i.test(userReply)) {
//         delete draftCache[userId];
//         return await getSafeFallbackReply(
//           chatId,
//           userId,
//           message,
//           fallbackMessage,
//           res,
//           "create_supplement"
//         );
//       }

//       if (
//         /^(no|mat cancel|continue|rakho|don’t stop|keep going)/i.test(userReply)
//       ) {
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           "👍 Great, let’s continue with supplement creation.",
//           res
//         );
//       }

//       return sendBotReply(
//         chatId,
//         userId,
//         message,
//         supplementIntent.ask || "Should I cancel supplement creation?",
//         res
//       );
//     }
//     draftCache[userId] = {
//       phase: "create_supplement",
//       collected: {
//         ...draftCache[userId]?.collected,
//         ...supplementIntent.collected,
//       },
//     };

//     const {
//       medicineName,
//       dosage,
//       price,
//       quantity,
//       singlePack,
//       mfgDate,
//       expDate,
//       description,
//       takenForSymptoms,
//       associatedRisks,
//     } = draftCache[userId].collected;

//     if (
//       medicineName &&
//       dosage &&
//       price &&
//       quantity &&
//       singlePack !== undefined &&
//       mfgDate &&
//       expDate
//     ) {
//       const payload = {
//         medicineName,
//         dosage,
//         price,
//         quantity,
//         singlePack: String(singlePack),
//         mfgDate,
//         expDate,
//         ...(description && { description }),
//         ...(takenForSymptoms && { takenForSymptoms }),
//         ...(associatedRisks && { associatedRisks }),
//       };

//       try {
//         await axios.post(`${config.base_url}/api/v1/supplement/add`, payload, {
//           headers: { Authorization: authHeader },
//         });

//         delete draftCache[userId];
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           `✅ Supplement "${payload.medicineName}" has been added successfully.`,
//           res
//         );
//       } catch (err) {
//         const errorMsg = err?.response?.data?.message || "";
//         console.error("❌ Error creating supplement:", errorMsg);

//         if (errorMsg.includes("already exists")) {
//           return sendBotReply(
//             chatId,
//             userId,
//             message,
//             `⚠️ This supplement already exists in your records.`,
//             res
//           );
//         }

//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           `⚠️ Failed to add the supplement. Please try again later.`,
//           res
//         );
//       }
//     }

//     return sendBotReply(chatId, userId, message, supplementIntent.ask, res);
//   } catch (err) {
//     console.error("❌ Error in handleCreateSupplement:", err);
//     return sendBotReply(
//       chatId,
//       userId,
//       message,
//       "⚠️ Something went wrong while processing the supplement creation.",
//       res
//     );
//   }
// };

const handleCreateSupplement = async (
  message,
  chatId,
  userId,
  authHeader,
  res
) => {
  try {
    const chatData = await ChatHistory.findById(chatId).lean();
    const messageHistory = [
      ...(chatData?.messages || []),
      { role: "user", message },
    ];

    // 🔄 Clear previous draft if phase is different
    if (draftCache[userId]?.phase !== "create_supplement") {
      delete draftCache[userId];
    }
    const userReply = message.toLowerCase();

    // 🔁 Exit handling
    if (
      draftCache[userId]?.phase === "create_supplement" &&
      draftCache[userId]?.suggestedField &&
      /^(yes|haan|sahi|correct|thik hai)$/i.test(userReply)
    ) {
      draftCache[userId].collected[draftCache[userId].suggestedField] =
        draftCache[userId].suggestedValue;
      delete draftCache[userId].suggestedField;
      delete draftCache[userId].suggestedValue;
    }

    const supplementIntent = await detectCreateSupplementIntentWithOpenAI(
      messageHistory,
      draftCache[userId]?.collected || {}
    );

    console.log("🟢 supplementIntent:", supplementIntent);

    if (
      draftCache[userId]?.phase === "create_supplement" &&
      supplementIntent.nextStep === "exit"
    ) {
      const priorMessage = messageHistory
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "user");
      const fallbackMessage = priorMessage?.message || message;

      if (/^(yes|cancel|haan|cancel kardo|exit|stop)/i.test(userReply)) {
        delete draftCache[userId];
        return await getSafeFallbackReply(
          chatId,
          userId,
          message,
          fallbackMessage,
          res,
          "create_supplement"
        );
      }

      if (
        /^(no|mat cancel|continue|rakho|don’t stop|keep going)/i.test(userReply)
      ) {
        return sendBotReply(
          chatId,
          userId,
          message,
          "👍 Great, let’s continue with supplement creation.",
          res
        );
      }

      return sendBotReply(
        chatId,
        userId,
        message,
        supplementIntent.ask || "Should I cancel supplement creation?",
        res
      );
    }

    // 💾 Update draft
    draftCache[userId] = {
      phase: "create_supplement",
      collected: {
        ...draftCache[userId]?.collected,
        ...supplementIntent.collected,
      },
    };

    // ✅ Clear suggestion if overridden
    if (supplementIntent.nextStep !== draftCache[userId]?.suggestedField) {
      delete draftCache[userId].suggestedField;
      delete draftCache[userId].suggestedValue;
    }

    const {
      medicineName,
      dosage,
      price,
      quantity,
      singlePack,
      mfgDate,
      expDate,
      description,
      takenForSymptoms,
      associatedRisks,
    } = draftCache[userId].collected;

    // ✅ Require purpose (takenForSymptoms) before saving; otherwise continue collecting
    if (medicineName && dosage && quantity && takenForSymptoms) {
      const payload = {
        medicineName,
        dosage,
        ...(price !== undefined ? { price } : {}),
        quantity,
        ...(singlePack !== undefined ? { singlePack: String(singlePack) } : {}),
        ...(mfgDate ? { mfgDate } : {}),
        ...(expDate ? { expDate } : {}),
        ...(description && { description }),
        ...(takenForSymptoms && { takenForSymptoms }),
        ...(associatedRisks && { associatedRisks }),
      };

      try {
        await axios.post(`${config.base_url}/api/v1/supplement/add`, payload, {
          headers: { Authorization: authHeader },
        });

        delete draftCache[userId];
        return sendBotReply(
          chatId,
          userId,
          message,
          `✅ Medicine "${payload.medicineName}" has been created successfully.`,
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("❌ Error creating supplement:", errorMsg);

        if (errorMsg.includes("already exists")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            `⚠️ This supplement already exists in your records.`,
            res
          );
        }

        return sendBotReply(
          chatId,
          userId,
          message,
          `⚠️ Failed to add the supplement. Please try again later.`,
          res
        );
      }
    }

    // Ask for whatever is still missing from the minimal set
    const missing = [];
    if (!medicineName) missing.push("medicine name");
    if (!dosage) missing.push("dosage");
    if (!quantity) missing.push("quantity");
    if (!takenForSymptoms) missing.push("purpose (what symptoms it’s for)");
    if (missing.length)
      return sendBotReply(
        chatId,
        userId,
        message,
        `📋 Please provide: ${missing.join(", ")}. You can send multiple together.`,
        res
      );

    return sendBotReply(chatId, userId, message, supplementIntent.ask, res);
  } catch (err) {
    console.error("❌ Error in handleCreateSupplement:", err);
    return sendBotReply(
      chatId,
      userId,
      message,
      "⚠️ Something went wrong while processing the supplement creation.",
      res
    );
  }
};

const getSafeFallbackReply = async (
  chatId,
  userId,
  message,
  fallbackMessage,
  res,
  previousPhase,
  authHeader
) => {
  try {
    const { intent: newIntent } = await detectMainIntentWithOpenAI(
      fallbackMessage
    );

    const actionIntents = [
      "create_vaccine",
      "create_supplement",
      "create_medicine_schedule",
      "create_vaccine_schedule",
      "general_query",
      "check_medicine_schedule",
      "check_vaccine_schedule",
      "generate_health_score",
    ];

    // ✅ If user switched to another valid action (e.g., from vaccine → supplement)
    if (
      newIntent &&
      newIntent !== previousPhase &&
      actionIntents.includes(newIntent)
    ) {
      console.log(
        `🔁 Switching from cancelled '${previousPhase}' to new intent '${newIntent}'`
      );

      delete draftCache[userId]; // reset old flow

      // Re-trigger main flow with new message
      return await chatWithHealthBot(
        {
          body: { message: fallbackMessage, chatId },
          headers: { authorization: authHeader },
          user: { _id: userId },
        },
        res
      );
    }

    // 🧠 Fallback to general health bot reply
    const fallbackReply = await getHealthGPTResponse(fallbackMessage);

    // Show success + advice
    return sendBotReply(
      chatId,
      userId,
      message,
      `✅ Action has been cancelled.\n\n${fallbackReply}`,
      res
    );
  } catch (error) {
    console.error("❌ Error in getSafeFallbackReply:", error);
    return sendBotReply(
      chatId,
      userId,
      message,
      "⚠️ Something went wrong while processing your request.",
      res
    );
  }
};

// const handleCreateHealthScore = async (
//   message,
//   chatId,
//   userId,
//   authHeader,
//   res
// ) => {
//   try {
//     const cacheKey = `${userId}_health_score`;
//     draftCache[cacheKey] = draftCache[cacheKey] || { answers: {} };

//     // Step 1: Fetch previous score from DB
//     let previousScore = null;
//     try {
//       const prevScoreRes = await axios.get(
//         `${config.base_url}/api/v1/health-score/list`,
//         { headers: { Authorization: authHeader } }
//       );
//       const scores = prevScoreRes.data?.body || [];
//       if (scores.length > 0) {
//         previousScore = scores[0].score;
//         console.log("💬 Previous Score:", previousScore);
//       }
//     } catch (err) {
//       console.warn("Failed to fetch previous score:", err.message);
//     }

//     // Step 2: Let the utility handle the logic of appending new answer
//     const healthScoreResult = await detectCreateHealthRecordIntentWithOpenAI(
//       message,
//       draftCache[cacheKey].answers,
//       previousScore
//     );
//     console.log("💬 Health Score Result:", healthScoreResult);

//     // Step 3: Update cache with new answers (after utility handles it)
//     if (healthScoreResult.answers) {
//       draftCache[cacheKey].answers = healthScoreResult.answers;
//     }

//     // Step 4: Respond with question if it exists
//     if (healthScoreResult.question) {
//       return sendBotReply(
//         chatId,
//         userId,
//         message,
//         healthScoreResult.question,
//         res
//       );
//     }

//     // Step 5: If we have a final score, save it to the database
//     if (healthScoreResult.score) {
//       const score = parseFloat(healthScoreResult.score);
//       console.log("💬 Final Score:", score);

//       try {
//         await axios.post(
//           `${config.base_url}/api/v1/health-score/add`,
//           { score },
//           { headers: { Authorization: authHeader } }
//         );
//       } catch (err) {
//         console.error("❌ Failed to save health score:", err.message);
//         draftCache[cacheKey] = { answers: {} };
//         return sendBotReply(
//           chatId,
//           userId,
//           message,
//           "⚠️ I couldn't save your health score. Please try again later.",
//           res
//         );
//       }

//       // Clear cache after final score is saved
//       draftCache[cacheKey] = { answers: {} };
//       return sendBotReply(
//         chatId,
//         userId,
//         message,
//         healthScoreResult.message,
//         res
//       );
//     }

//     // Step 6: If something unexpected happened
//     return sendBotReply(
//       chatId,
//       userId,
//       message,
//       "⚠️ Something went wrong. Please try again.",
//       res
//     );
//   } catch (error) {
//     console.error("❌ handleCreateHealthScore error:", error.message);
//     const cacheKey = `${userId}_health_score`;
//     draftCache[cacheKey] = { answers: {} };
//     return sendBotReply(
//       chatId,
//       userId,
//       message,
//       "⚠️ Something went wrong while calculating your health score. Please try again.",
//       res
//     );
//   }
// };

const handleCreateHealthScore = async (
  message,
  chatId,
  userId,
  authHeader,
  res
) => {
  try {
    const chatData = await ChatHistory.findById(chatId).lean();
    const messageHistory = chatData?.messages || [];

    messageHistory.push({ role: "user", message });

    const cacheKey = `${userId}_health_score`;
    draftCache[cacheKey] = draftCache[cacheKey] || {
      answers: {},
      phase: "generate_health_score",
    };

    // Step 1: Fetch previous score from DB
    let previousScore = null;
    try {
      const prevScoreRes = await axios.get(
        `${config.base_url}/api/v1/health-score/list`,
        { headers: { Authorization: authHeader } }
      );
      const scores = prevScoreRes.data?.body || [];
      if (scores.length > 0) {
        previousScore = scores[0].score;
        console.log("💬 Previous Score:", previousScore);
      }
    } catch (err) {
      console.warn("Failed to fetch previous score:", err.message);
    }

    // Step 2: Build message history
    // const chatData = await ChatHistory.findById(chatId).lean();
    // const messageHistory = [
    //   ...(chatData?.messages || []),
    //   { role: "user", message },
    // ];

    // console.log("💬 Message History:", messageHistory);

    // Step 3: Detect intent
    const healthScoreResult = await detectCreateHealthRecordIntentWithOpenAI(
      message,
      draftCache[cacheKey].answers,
      previousScore
    );

    // console.log("💬 Health Score Result:", healthScoreResult);
    // console.log("Draft Cache:", draftCache[cacheKey]);

    // 🔁 Handle Exit Step Logic
    // if (
    //   draftCache[cacheKey]?.phase === "generate_health_score" &&
    //   healthScoreResult.nextStep === "exit"
    // ) {
    //   const userReply = message.toLowerCase();
    //   console.log("💬 User Reply:", userReply);
    //   const priorMessage = messageHistory
    //     .slice()
    //     .reverse()
    //     .find((msg) => msg.role === "user" && msg.message !== message);
    //     console.log("💬 Prior Message:", priorMessage);
    //   const fallbackMessage = priorMessage?.message || message;
    //   console.log("💬 Fallback Message:", fallbackMessage);

    //   if (/^(yes|cancel|haan|cancel kardo|exit|stop)/i.test(userReply)) {
    //     delete draftCache[cacheKey];
    //     return await getSafeFallbackReply(
    //       chatId,
    //       userId,
    //       message,
    //       fallbackMessage,
    //       res,
    //       "generate_health_score"
    //     );
    //   }

    //   if (
    //     /^(no|mat cancel|continue|rakho|don’t stop|keep going)/i.test(userReply)
    //   ) {
    //     return sendBotReply(
    //       chatId,
    //       userId,
    //       message,
    //       "👍 Great, let’s continue with health score calculation.",
    //       res
    //     );
    //   }

    //   return sendBotReply(
    //     chatId,
    //     userId,
    //     message,
    //     healthScoreResult.ask || "Should I cancel health score calculation?",
    //     res
    //   );
    // }

    // 🔁 Handle Exit Step Logic
    if (
      draftCache[cacheKey]?.phase === "generate_health_score" &&
      healthScoreResult.nextStep === "exit"
    ) {
      const cancelMessage = message.toLowerCase();
      console.log("💬 Cancel message:", cancelMessage);

      const fallbackChat = await ChatHistory.findById(chatId).lean();
      console.log("📜 Fallback chat:", fallbackChat);
      const priorUserMessage = fallbackChat?.messages
        ?.slice()
        ?.reverse()
        ?.find((msg) => msg.role === "user" && msg.message !== message);
      console.log("💬 Prior user message:", priorUserMessage);
      const fallbackMessage = priorUserMessage?.message || message;
      console.log("💬 Fallback message:", fallbackMessage);

      if (
        /^(yes|cancel|haan|cancel kardo|yes cancel|exit|stop|haan cancel)/i.test(
          cancelMessage
        )
      ) {
        delete draftCache[cacheKey];
        return await getSafeFallbackReply(
          chatId,
          userId,
          message,
          fallbackMessage,
          res,
          "generate_health_score"
        );
      }

      if (
        /^(no|continue|mat cancel|don’t cancel|keep going|nahi|continue rakho)/i.test(
          cancelMessage
        )
      ) {
        const followUp =
          Object.keys(draftCache[cacheKey]?.answers || {}).length === 0
            ? "💬 Okay! Let’s start with your health score. How many steps do you take daily?"
            : "👍 Great! Let’s continue with your health score calculation.";

        return sendBotReply(chatId, userId, message, followUp, res);
      }

      return sendBotReply(
        chatId,
        userId,
        message,
        healthScoreResult.ask ||
          "Do you want to cancel health score calculation?",
        res
      );
    }

    // Step 4: Save updated answers
    if (healthScoreResult.answers) {
      draftCache[cacheKey].answers = healthScoreResult.answers;
    }

    // Step 5: Ask next question
    if (healthScoreResult.question) {
      return sendBotReply(
        chatId,
        userId,
        message,
        healthScoreResult.question,
        res
      );
    }

    // Step 6: Save final score
    if (healthScoreResult.score) {
      const score = parseFloat(healthScoreResult.score);
      console.log("💬 Final Score:", score);

      try {
        await axios.post(
          `${config.base_url}/api/v1/health-score/add`,
          { score },
          { headers: { Authorization: authHeader } }
        );
      } catch (err) {
        console.error("❌ Failed to save health score:", err.message);
        delete draftCache[cacheKey];
        return sendBotReply(
          chatId,
          userId,
          message,
          "⚠️ I couldn't save your health score. Please try again later.",
          res
        );
      }

      delete draftCache[cacheKey];
      return sendBotReply(
        chatId,
        userId,
        message,
        healthScoreResult.message || "✅ Your health score has been saved.",
        res
      );
    }

    return sendBotReply(
      chatId,
      userId,
      message,
      "⚠️ Something went wrong. Please try again.",
      res
    );
  } catch (error) {
    console.error("❌ handleCreateHealthScore error:", error.message);
    const cacheKey = `${userId}_health_score`;
    delete draftCache[cacheKey];
    return sendBotReply(
      chatId,
      userId,
      message,
      "⚠️ Something went wrong while calculating your health score. Please try again.",
      res
    );
  }
};

export { handleCreateSupplement };

export default {
  chatWithHealthBot,
};
