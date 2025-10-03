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

// 🧹 Memory cleanup mechanism to prevent memory leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const maxAge = 3600000; // 1 hour in milliseconds
  
  // Cleanup draftCache
  Object.keys(draftCache).forEach(key => {
    if (draftCache[key].lastAccessed && (now - draftCache[key].lastAccessed) > maxAge) {
      console.log(`🧹 Cleaning up expired draft cache for: ${key}`);
      delete draftCache[key];
    }
  });
  
  // Cleanup sessionMessages (keep only last 20 sessions)
  const sessionKeys = Object.keys(sessionMessages);
  if (sessionKeys.length > 20) {
    const sessionsToRemove = sessionKeys.slice(0, sessionKeys.length - 20);
    sessionsToRemove.forEach(key => {
      console.log(`🧹 Cleaning up old session messages for: ${key}`);
      delete sessionMessages[key];
    });
  }
}, 300000); // Run cleanup every 5 minutes

// Update lastAccessed timestamp when accessing draftCache
const updateDraftCacheAccess = (sessionId) => {
  if (draftCache[sessionId]) {
    draftCache[sessionId].lastAccessed = Date.now();
  }
};

// 🚦 Rate limiting to prevent abuse
const rateLimiter = new Map();
const checkRateLimit = (userId) => {
  const now = Date.now();
  const userRequests = rateLimiter.get(userId) || [];
  const recentRequests = userRequests.filter(time => now - time < 60000); // 1 minute
  
  if (recentRequests.length > 15) { // Max 15 requests per minute
    return false;
  }
  
  recentRequests.push(now);
  rateLimiter.set(userId, recentRequests);
  return true;
};

// Cleanup rate limiter every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimiter.forEach((requests, userId) => {
    const recentRequests = requests.filter(time => now - time < 60000);
    if (recentRequests.length === 0) {
      rateLimiter.delete(userId);
    } else {
      rateLimiter.set(userId, recentRequests);
    }
  });
}, 300000);

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

// 🛡️ Enhanced Input validation and sanitization functions
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove JS protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim()
    .substring(0, 1000); // Limit length to 1000 characters
};

const validateInput = (input) => {
  if (!input || typeof input !== 'string') return false;
  if (input.length < 1 || input.length > 1000) return false;
  if (/[<>]/.test(input)) return false; // Check for HTML tags
  return true;
};

// 🚨 CRITICAL: Harmful content detection patterns
const harmfulContentPatterns = [
  // Violence and weapons - Enhanced patterns
  /\b(bomb|explosive|weapon|gun|knife|sword|poison|toxic|lethal|deadly)\b/i,
  /\b(kill|murder|assassinate|destroy|harm|hurt|violence|violent)\b/i,
  /\b(suicide|self.harm|self.hurt|end.life|take.life|kill.myself)\b/i,
  
  // How-to dangerous queries - CRITICAL ADDITION
  /\b(how.to|how.do.i|how.can.i|how.do.you|how.to.make|how.to.create|how.to.build)\b.*\b(bomb|explosive|weapon|poison|toxic|lethal|deadly)\b/i,
  /\b(how.to|how.do.i|how.can.i|how.do.you|how.to.make|how.to.create|how.to.build)\b.*\b(strangle|choke|suffocate|hang|kill|murder)\b/i,
  /\b(how.to|how.do.i|how.can.i|how.do.you|how.to.make|how.to.create|how.to.build)\b.*\b(myself|self|suicide|self.harm)\b/i,
  
  // Direct dangerous queries
  /\b(strangle|choke|suffocate|hang|kill|murder)\b.*\b(myself|self)\b/i,
  /\b(make|create|build|construct|build)\b.*\b(bomb|explosive|weapon|poison|toxic)\b/i,
  
  // Dangerous substances
  /\b(cyanide|arsenic|mercury|lead|radiation|nuclear|chemical.weapon)\b/i,
  /\b(drug.overdose|overdose|poisoning|toxic.substance)\b/i,
  
  // Illegal activities
  /\b(illegal|crime|criminal|fraud|scam|hack|hacking|cyber.attack)\b/i,
  /\b(terrorism|terrorist|bombing|attack|threat|threatening)\b/i,
  
  // Self-harm and dangerous behaviors - Enhanced
  /\b(cut.myself|hurt.myself|self.injury|self.mutilation)\b/i,
  /\b(jump.off|jump.from|hang.myself|strangle|choke|suffocate)\b/i,
  /\b(strangle|choke|suffocate)\b.*\b(myself|self)\b/i,
  
  // Dangerous medical advice
  /\b(overdose|excessive.dose|too.much.medicine|dangerous.dose)\b/i,
  /\b(mix.medicines|combine.drugs|interact.dangerously)\b/i,
  
  // Hate speech and discrimination
  /\b(hate|racist|sexist|discriminat|offensive|abusive)\b/i,
  
  // Adult content
  /\b(sexual|porn|adult|explicit|inappropriate)\b/i
];

// 🛡️ Safety violation detection
const detectHarmfulContent = (input) => {
  const lowerInput = input.toLowerCase();
  
  for (const pattern of harmfulContentPatterns) {
    if (pattern.test(lowerInput)) {
      return {
        isHarmful: true,
        matchedPattern: pattern.toString(),
        severity: getSeverityLevel(pattern)
      };
    }
  }
  
  return { isHarmful: false };
};

// 🚨 Severity levels for different types of harmful content
const getSeverityLevel = (pattern) => {
  const highSeverityPatterns = [
    /\b(suicide|self.harm|kill.myself|end.life)\b/i,
    /\b(bomb|explosive|weapon|poison|toxic|lethal)\b/i,
    /\b(terrorism|terrorist|bombing|attack)\b/i,
    // New high severity patterns
    /\b(how.to|how.do.i|how.can.i|how.do.you|how.to.make|how.to.create|how.to.build)\b.*\b(bomb|explosive|weapon|poison|toxic|lethal|deadly)\b/i,
    /\b(how.to|how.do.i|how.can.i|how.do.you|how.to.make|how.to.create|how.to.build)\b.*\b(strangle|choke|suffocate|hang|kill|murder)\b/i,
    /\b(how.to|how.do.i|how.can.i|how.do.you|how.to.make|how.to.create|how.to.build)\b.*\b(myself|self|suicide|self.harm)\b/i,
    /\b(strangle|choke|suffocate|hang|kill|murder)\b.*\b(myself|self)\b/i,
    /\b(make|create|build|construct|build)\b.*\b(bomb|explosive|weapon|poison|toxic)\b/i
  ];
  
  const mediumSeverityPatterns = [
    /\b(violence|violent|harm|hurt|destroy)\b/i,
    /\b(illegal|crime|criminal|fraud)\b/i,
    /\b(overdose|excessive.dose|dangerous.dose)\b/i
  ];
  
  if (highSeverityPatterns.some(p => p.toString() === pattern.toString())) {
    return 'HIGH';
  } else if (mediumSeverityPatterns.some(p => p.toString() === pattern.toString())) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
};

// 🛡️ Safe response for harmful content
const getSafetyResponse = (severity) => {
  const responses = {
    HIGH: "I cannot and will not provide information that could be harmful or dangerous. If you're experiencing thoughts of self-harm, please contact a mental health professional immediately or call a crisis helpline. Your safety is important.",
    MEDIUM: "I cannot provide information about potentially harmful activities. If you have health concerns, I'd be happy to help with safe, medical advice instead.",
    LOW: "I'm designed to provide helpful health information. I cannot assist with that type of request. How else can I help you with your health needs?"
  };
  
  return responses[severity] || responses.LOW;
};

// 🚨 Additional safety patterns for edge cases
const additionalSafetyPatterns = [
  // Coded language and euphemisms
  /\b(kys|kms|unalive|self.unalive|end.it|off.myself)\b/i,
  /\b(rope|bridge|jump|hang|cut|slice|bleed)\b.*\b(myself|self)\b/i,
  
  // Medical abuse patterns
  /\b(overdose|od|too.much|excessive|dangerous.dose)\b/i,
  /\b(mix|combine|mix.together)\b.*\b(medicines|drugs|pills)\b/i,
  
  // Violence euphemisms
  /\b(eliminate|terminate|neutralize|dispose)\b/i,
  /\b(hurt|harm|damage)\b.*\b(someone|others|people)\b/i,
  
  // Enhanced dangerous instructions - More comprehensive
  /\b(how.to|how.do.i|instructions|steps|tutorial|guide|way.to|method.to)\b.*\b(make|create|build|construct|do|perform)\b.*\b(bomb|weapon|poison|toxic|strangle|choke|kill|murder)\b/i,
  /\b(how.to|how.do.i|instructions|steps|tutorial|guide|way.to|method.to)\b.*\b(strangle|choke|suffocate|hang|kill|murder)\b.*\b(myself|self)\b/i,
  /\b(how.to|how.do.i|instructions|steps|tutorial|guide|way.to|method.to)\b.*\b(make|create|build|construct)\b.*\b(bomb|explosive|weapon|poison|toxic)\b/i
];

// 🛡️ Enhanced safety check with additional patterns
const enhancedSafetyCheck = (input) => {
  const lowerInput = input.toLowerCase();
  
  // Check main harmful patterns
  const mainCheck = detectHarmfulContent(input);
  if (mainCheck.isHarmful) {
    return mainCheck;
  }
  
  // Check additional safety patterns
  for (const pattern of additionalSafetyPatterns) {
    if (pattern.test(lowerInput)) {
      return {
        isHarmful: true,
        matchedPattern: pattern.toString(),
        severity: 'HIGH' // Additional patterns are treated as high severity
      };
    }
  }
  
  return { isHarmful: false };
};

// 🧪 Test function for safety patterns (for debugging)
const testSafetyPatterns = (testQueries) => {
  console.log('🧪 Testing Safety Patterns:');
  testQueries.forEach(query => {
    const result = enhancedSafetyCheck(query);
    console.log(`Query: "${query}"`);
    console.log(`Result: ${result.isHarmful ? 'HARMFUL' : 'SAFE'}`);
    if (result.isHarmful) {
      console.log(`Severity: ${result.severity}`);
      console.log(`Matched Pattern: ${result.matchedPattern}`);
    }
    console.log('---');
  });
};

// 🧪 Test endpoint for safety patterns
const testSafetyEndpoint = async (req, res) => {
  try {
    const testQueries = [
      "How to strangle myself",
      "How to make a bomb",
      "How to kill myself",
      "How to create poison",
      "How to hang myself",
      "What is diabetes?", // This should be safe
      "How to treat fever" // This should be safe
    ];
    
    testSafetyPatterns(testQueries);
    
    return apiResponse({
      res,
      status: true,
      statusCode: 200,
      data: { message: "Safety patterns tested. Check console for results." },
      message: "Test completed successfully"
    });
  } catch (error) {
    console.error('Test safety endpoint error:', error);
    return apiResponse({
      res,
      status: false,
      statusCode: 500,
      data: null,
      message: "Test failed"
    });
  }
};

const chatWithHealthBot = async (req, res) => {
  try {
    console.log({reqIp: req.ip});
    let { message, chatId, audioUrl } = req.body;
    
    // 🛡️ Input validation
    if (message && !validateInput(message)) {
      return apiResponse({
        res,
        status: false,
        statusCode: 400,
        data: null,
        message: "Invalid input detected. Please provide a valid message.",
      });
    }
    
    // 🚨 CRITICAL: Enhanced safety check for harmful content
    if (message) {
      const safetyCheck = enhancedSafetyCheck(message);
      if (safetyCheck.isHarmful) {
        // Enhanced safety violation logging
        const violationData = {
          message: message,
          severity: safetyCheck.severity,
          pattern: safetyCheck.matchedPattern,
          ip: req.ip,
          userId: req.user?._id,
          userAgent: req.headers['user-agent'],
          sessionId: sessionId,
          timestamp: new Date().toISOString()
        };
        
        // Log safety violation for monitoring
        await logSafetyViolation(violationData);
        
        // Also log to query database
        try {
          await logQueryToDB({
            anonToken: req.headers['x-anon-token'],
            query: message,
            aiResponse: getSafetyResponse(safetyCheck.severity),
            model: 'safety-filter',
            tokensUsed: 0,
            success: false,
            errorMessage: `Safety violation detected: ${safetyCheck.severity} severity`,
            ip: getIPv4Address(req),
            source: 'safety_check'
          });
        } catch (logError) {
          console.error("Failed to log safety violation to query DB:", logError);
        }
        
        return apiResponse({
          res,
          status: false,
          statusCode: 400,
          data: null,
          message: getSafetyResponse(safetyCheck.severity),
        });
      }
    }
    
    // 🛡️ Sanitize input
    if (message) {
      message = sanitizeInput(message);
    }
    
    const userId = req.user?._id;
    const sessionId = userId || req.body?.chatId || req.headers['x-anon-token'] || req.ip;
    const authHeader = req.headers.authorization || "";

    // 🚦 Check rate limit
    if (!checkRateLimit(sessionId)) {
      return apiResponse({
        res,
        status: false,
        statusCode: 429,
        data: null,
        message: "Too many requests. Please wait a moment before trying again.",
      });
    }

    console.log("🔑 User ID:", userId);
    console.log("🔑 Session ID:", sessionId);
    console.log("🔑 Chat ID:", chatId);
    console.log("🔑 Auth Header:", authHeader ? "Present" : "Missing");

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
    console.log("🔍 Raw existing chat data:", existing);
    const priorDb = (existing?.messages || []).map((m) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.message,
    }));
    console.log("🔍 Mapped prior DB messages:", priorDb);
    const priorMem = sessionMessages[sessionId] || [];
    console.log("🔍 Prior memory messages:", priorMem);
    const prior = [...priorDb, ...priorMem];
    const intentHistory = [...prior, { role: "user", content: normalizedMessage }];

    console.log("🔍 Conversation history for intent detection:");
    console.log("🔍 Prior DB messages:", priorDb.length);
    console.log("🔍 Prior memory messages:", priorMem.length);
    console.log("🔍 Current user message:", normalizedMessage);
    console.log("🔍 Last few messages:", prior.slice(-3).map(m => `${m.role}: ${m.content}`));
    console.log("🔍 Full intent history:", intentHistory.map(m => `${m.role}: ${m.content}`));

    // 🔒 Enhanced Heuristic: Only trigger creation hints for specific creation contexts
    const lastAssistant = [...prior].reverse().find((m) => m.role === "assistant");
    
    // 🛡️ IMPROVED: More specific creation field hints that won't trigger on symptoms
    const creationFieldHints = [
      "what's the name of the medicine",
      "what is the name of the medicine", 
      "medicine name",
      "name of the medicine",
      "which medicine would you like to create",
      "which supplement would you like to create",
      "which vaccine would you like to create",
      "please provide the medicine details",
      "please provide the supplement details",
      "please provide the vaccine details",
      "let's create a new medicine",
      "let's create a new supplement", 
      "let's create a new vaccine",
      "to complete your medicine creation",
      "to complete your supplement creation",
      "to complete your vaccine creation",
      "medicine creation process",
      "supplement creation process",
      "vaccine creation process"
    ];
    
    // 🛡️ IMPROVED: Enhanced symptom detection patterns to avoid false triggers
    const symptomPatterns = [
      // Feeling/experiencing patterns
      /\b(am having|having|feeling|feel|experiencing|experience|suffering from|suffering)\b/i,
      // Physical symptoms
      /\b(pain|ache|hurt|hurts|sore|tired|weak|dizzy|nausea|fever|cough|cold|headache|stomach|back|chest|throat|joint|muscle|muscle)\b/i,
      // General health concerns
      /\b(symptoms|symptom|problem|problems|issue|issues|condition|conditions|discomfort|discomforts)\b/i,
      // Feeling unwell patterns
      /\b(not feeling well|don't feel well|feel sick|feeling sick|unwell|ill|sick|uncomfortable)\b/i,
      // Seeking help patterns
      /\b(what should i do|what to do|help me|advice|suggestions|recommendations|guidance)\b/i,
      // Body parts with issues
      /\b(head|neck|shoulder|arm|leg|knee|ankle|foot|hand|finger|eye|ear|nose|mouth|tooth|teeth)\b.*\b(hurts|pain|ache|sore|problem|issue)\b/i
    ];
    
    let shouldSkipIntentDetection = false;
    
    // CRITICAL: Don't trigger creation hints if we're already in medicine schedule flow
    const isInMedicineScheduleFlow = draftCache[sessionId]?.phase === 'create_medicine_schedule';
    
    // 🛡️ IMPROVED: Check if current message is symptom-based first
    const isSymptomQuery = symptomPatterns.some(pattern => pattern.test(normalizedMessage));
    
    if (lastAssistant && !isInMedicineScheduleFlow && !isSymptomQuery) {
      console.log("🔍 Last assistant message:", lastAssistant.content);
      console.log("🔍 Checking against creation hints:", creationFieldHints);
      console.log("🔍 Is symptom query:", isSymptomQuery);
      
      const askedCreation = creationFieldHints.some((k) => {
        const includes = (lastAssistant.content || "").toLowerCase().includes(k);
        if (includes) {
          console.log("Found creation hint:", k);
        }
        return includes;
      });
      console.log("🔍 Asked creation:", askedCreation);
      
      if (askedCreation) {
        // Force/keep creation phase
        draftCache[sessionId] = draftCache[sessionId] || { phase: "create_supplement", collected: {} };
        draftCache[sessionId].phase = "create_supplement";
        shouldSkipIntentDetection = true; // Skip main intent detection when in creation phase
        console.log("🔒 Set creation phase and skipping intent detection");
        console.log("🔒 Current draftCache state:", draftCache[sessionId]);
        
        // 🧹 Update access timestamp
        updateDraftCacheAccess(sessionId);
      } else {
        console.log("No creation hint found in:", lastAssistant.content);
      }
    } else if (isInMedicineScheduleFlow) {
      console.log("🔒 Already in medicine schedule flow, skipping creation hints check");
      shouldSkipIntentDetection = true; // Keep the current flow
      
      // 🧹 Update access timestamp
      updateDraftCacheAccess(sessionId);
    } else if (isSymptomQuery) {
      console.log("🔍 Detected symptom query, skipping creation hints check");
      shouldSkipIntentDetection = false; // Allow proper intent detection for symptoms
    } else {
      console.log("No last assistant message found");
    }
    
    // Only detect main intent if we're not in a creation phase
    let intent = "general_query";
    if (!shouldSkipIntentDetection) {
      console.log("Calling main intent detection...");
      try {
        const { intent: detectedIntent } = await detectMainIntentWithOpenAI(intentHistory);
        intent = detectedIntent;
        console.log("Detected intent via OpenAI:", intent);
      } catch (intentError) {
        console.error("Intent detection failed, using fallback:", intentError);
        // 🛡️ Fallback intent detection based on message content
        const messageLower = normalizedMessage.toLowerCase();
        if (/\b(create|make|add)\b.*\b(vaccine|vaccination)\b/i.test(messageLower)) {
          intent = "create_vaccine";
        } else if (/\b(create|make|add)\b.*\b(medicine|medication|meds)\b/i.test(messageLower)) {
          intent = "create_medicine";
        } else if (/\b(create|make|add)\b.*\b(supplement|vitamin)\b/i.test(messageLower)) {
          intent = "create_supplement";
        } else if (/\b(schedule|scheduale|schedualing)\b.*\b(medicine|medication|meds)\b/i.test(messageLower)) {
          intent = "create_medicine_schedule";
        } else if (/\b(schedule|scheduale|schedualing)\b.*\b(vaccine|vaccination)\b/i.test(messageLower)) {
          intent = "create_vaccine_schedule";
        } else {
          intent = "general_query";
        }
        console.log("Using fallback intent detection:", intent);
      }
    } else {
      // If we're in creation phase, use the existing phase
      intent = draftCache[sessionId]?.phase || "create_supplement";
      console.log("Using cached creation phase:", intent);
    }
    
    console.log("Main Intent Detected:", intent);
    console.log("Should Skip Intent Detection:", shouldSkipIntentDetection);
    console.log("Current Draft Cache Phase:", draftCache[sessionId]?.phase);
    console.log("Final intent being used:", intent);

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

    // 🛡️ IMPROVED: Enhanced general query handling with better context awareness
    const chatData = chatId ? await ChatHistory.findById(chatId).lean() : null;
    const historyDb = (chatData?.messages || []).map((m) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.message,
    }));
    const historyMem = sessionMessages[sessionId] || [];
    const history = [...historyDb, ...historyMem, { role: "user", content: message }];
    
    // 🛡️ IMPROVED: Enhanced context for symptom-based queries
    const enhancedHistory = [...history];
    
    // Add context about user's intent if it's a symptom query
    if (isSymptomQuery) {
      console.log("🔍 Detected symptom query, providing enhanced medical advice context");
      // Add a system message to guide the AI for symptom-based responses
      enhancedHistory.unshift({
        role: "system",
        content: "The user is describing symptoms and seeking medical advice. Provide helpful, safe medical guidance focusing on symptom relief and when to seek professional help. Do NOT ask for medicine creation details unless specifically requested."
      });
    }
    
    const reply = await getHealthGPTResponse(enhancedHistory);
    
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
    console.error("Error in chatWithHealthBot:", error);
    
    // 🛡️ Better error handling with specific error types
    let statusCode = 500;
    let errorMessage = "Internal server error while chatting with HealthBot.";
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = "Invalid input data provided.";
    } else if (error.name === 'RateLimitError') {
      statusCode = 429;
      errorMessage = "Too many requests. Please try again later.";
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
      errorMessage = "Service temporarily unavailable. Please try again later.";
    }
    
    try {
      await logQueryToDB({
        anonToken: req.headers['x-anon-token'],
        query: req.body?.message || 'Unknown',
        model: 'gpt-4',
        success: false,
        errorMessage: error.message,
        ip: getIPv4Address(req),
      });
    } catch (logError) {
      console.error("Failed to log error to DB:", logError);
    }

    // 🛡️ CRITICAL: Don't break the user experience even on system errors
    const userFriendlyMessage = `I encountered a technical issue while processing your request. 

Don't worry! You can:
• Try your request again
• Rephrase your question
• Ask something else
• Or wait a moment and try again

What would you like to do?`;

    return apiResponse({
      res,
      status: false,
      statusCode,
      data: null,
      message: userFriendlyMessage,
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
    console.error("Error fetching medicine schedule:", err);
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
    console.log("🔍 Vaccine Schedule API Call Details:");
    console.log("📅 Date:", vaccineIntent.date);
    console.log("🔗 API URL:", `${config.base_url}/api/v1/vaccine-schedule/by-date?date=${vaccineIntent.date}`);
    console.log("🔑 Auth Header:", authHeader ? "Present" : "Missing");
    
    const vacRes = await axios.get(
      `${config.base_url}/api/v1/vaccine-schedule/by-date?date=${vaccineIntent.date}`,
      { headers: { Authorization: authHeader } }
    );
    
    console.log("✅ Vaccine Schedule API Response:");
    console.log("📊 Status:", vacRes.status);
    console.log("📋 Full Response:", JSON.stringify(vacRes.data, null, 2));
    console.log("💉 Vaccines Array:", vacRes?.data?.body || []);
    
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
    console.error("Vaccine fetch error:", err);
    return sendBotReply(
      chatId,
      userId,
      message,
      "Unable to fetch vaccination schedule.",
      res
    );
  }
};

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

    // Handle help command
    if (/^(help|guidance|what to do|how to|instructions)/i.test(userReply)) {
      const collected = draftCache[userId]?.collected || {};
      const missing = [];
      
      if (!collected.vaccineName && !collected.vaccineId) missing.push("vaccine name");
      if (!collected.date) missing.push("date");
      if (!collected.doseTime) missing.push("dose time");
      
      if (missing.length > 0) {
        let helpMessage = "To complete your vaccine schedule, I still need:\n";
        missing.forEach((item, index) => {
          helpMessage += `• ${item.charAt(0).toUpperCase() + item.slice(1)}`;
          if (index < missing.length - 1) helpMessage += "\n";
        });
        helpMessage += "\n\nYou can also say 'cancel' to stop or 'help' for more guidance.";
        return sendBotReply(chatId, userId, message, helpMessage, res);
      } else {
        return sendBotReply(
          chatId,
          userId,
          message,
          "Great! You have all the information needed. I'm creating your vaccine schedule now...",
          res
        );
      }
    }

    // ✅ Confirm suggested date if user says "yes"
    if (
      draftCache[userId]?.phase === "create_vaccine_schedule" &&
      draftCache[userId]?.suggestedDate &&
      /^(yes|haan|sahi|correct|thik hai)$/i.test(userReply)
    ) {
      draftCache[userId].collected.date = draftCache[userId].suggestedDate;
      delete draftCache[userId].suggestedDate;
    }

    let createIntent;
    try {
      createIntent = await detectCreateVaccineScheduleIntentWithOpenAI(
        messageHistory,
        draftCache[userId]?.collected || {}
      );
    } catch (error) {
      console.error("🔍 CONTROLLER: Error in detectCreateVaccineScheduleIntentWithOpenAI:", error);
      
      // 🛡️ NEVER LET THE BOT STOP: Provide fallback response
      console.log("🔍 CONTROLLER: Using fallback response to keep conversation alive");
      return sendBotReply(
        chatId,
        userId,
        message,
        "I'm here to help you schedule a vaccine. Let's start fresh. Please provide the vaccine name first.",
        res
      );
    }

    // 🛡️ IMMEDIATE VALIDATION: Check if GPT already provided validation message
    if (createIntent.ask && createIntent.ask.includes("⚠️")) {
      console.log("🔍 CONTROLLER: GPT provided validation message, sending immediately");
      return sendBotReply(chatId, userId, message, createIntent.ask, res);
    }

    // 🛡️ IMMEDIATE VALIDATION: Fallback validation for date and time
    const collected = createIntent.collected || {};
    
    // 🛡️ FALLBACK VALIDATION: Check raw message for past date patterns
    const lowerMessage = message.toLowerCase();
    const pastDatePatterns = [
      /yesterday/i,
      /last\s+(week|month|year)/i,
      /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19\d{2}|200[0-4]|2005|2006|2007|2008|2009|2010|2011|2012|2013|2014|2015|2016|2017|2018|2019|2020|2021|2022|2023|2024)/i,
      /(\d{1,2})\/(\d{1,2})\/(19\d{2}|200[0-4]|2005|2006|2007|2008|2009|2010|2011|2012|2013|2014|2015|2016|2017|2018|2019|2020|2021|2022|2023|2024)/i
    ];
    
    const hasPastDatePattern = pastDatePatterns.some(pattern => pattern.test(lowerMessage));
    if (hasPastDatePattern) {
      console.log("🔍 CONTROLLER: Past date pattern detected in raw message");
      return sendBotReply(
        chatId,
        userId,
        message,
        "⚠️ I noticed you mentioned a past date. Please provide a future date for your vaccine schedule.",
        res
      );
    }
    
    // Date validation
    if (collected.date) {
      const userDate = new Date(collected.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (userDate < today) {
        console.log(`❌ CONTROLLER: Past date detected: ${collected.date}`);
        return sendBotReply(
          chatId,
          userId,
          message,
          "⚠️ The date you provided is in the past. Please select a future date for your vaccine schedule.",
          res
        );
      }
    }
    
    // Time validation (only if date is today)
    if (collected.doseTime && collected.date) {
      const scheduleDate = new Date(collected.date);
      const today = new Date();
      
      // Check if schedule date is today
      if (scheduleDate.getDate() === today.getDate() &&
          scheduleDate.getMonth() === today.getMonth() &&
          scheduleDate.getFullYear() === today.getFullYear()) {
        
        console.log("🔍 CONTROLLER: Schedule date is today, validating dose time");
        
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        // Parse time string
        let timeInMinutes;
        const timeStr = collected.doseTime;
        
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
          // 12-hour format
          const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
          if (match) {
            let hour = parseInt(match[1]);
            const minute = parseInt(match[2]) || 0;
            const period = match[3].toUpperCase();

            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;

            timeInMinutes = hour * 60 + minute;
          }
        } else {
          // 24-hour format
          const match = timeStr.match(/(\d{1,2}):?(\d{2})?/);
          if (match) {
            const hour = parseInt(match[1]);
            const minute = parseInt(match[2]) || 0;
            timeInMinutes = hour * 60 + minute;
          }
        }
        
        if (timeInMinutes !== undefined && timeInMinutes < currentTime) {
          console.log(`❌ CONTROLLER: Past dose time detected: ${timeStr} (${timeInMinutes} minutes vs current ${currentTime} minutes)`);
          return sendBotReply(
            chatId,
            userId,
            message,
            `⚠️ Dose time "${timeStr}" is in the past for today. Please provide a future time since your vaccine is scheduled for today.`,
            res
          );
        }
      }
    }

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

      if (/^(yes|cancel|exit|haan|stop|cancel kardo|start over|restart)/i.test(userReply)) {
        delete draftCache[userId];
        // ✅ Simple cancellation message instead of complex fallback
        return sendBotReply(
          chatId,
          userId,
          message,
          "Vaccine schedule creation cancelled. How else can I assist you today?",
          res
        );
      }

      if (/^(no|continue|rakho|mat cancel|keep going|continue schedule)/i.test(userReply)) {
        return sendBotReply(
          chatId,
          userId,
          message,
          "Great! Let's continue with your vaccine schedule. What would you like to tell me next?",
          res
        );
      }

      if (/^(different|new question|health question|ask something else)/i.test(userReply)) {
        delete draftCache[userId];
        return sendBotReply(
          chatId,
          userId,
          message,
          "Sure! I'm here to help with any health questions. What would you like to know?",
          res
        );
      }

      return sendBotReply(
        chatId,
        userId,
        message,
        createIntent.ask ||
          "I notice you're asking about something different. Would you like to:\n• Continue creating your vaccine schedule\n• Cancel and start over\n• Ask a different health question\n\nJust let me know what you'd prefer!",
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
      console.log("🔍 Vaccine List API Call Details:");
      console.log("🔗 API URL:", `${config.base_url}/api/v1/vaccine`);
      console.log("🔑 Auth Header:", authHeader ? "Present" : "Missing");
      
      const vacRes = await axios.get(`${config.base_url}/api/v1/vaccine`, {
        headers: { Authorization: authHeader },
      });

      console.log("✅ Vaccine List API Response:");
      console.log("📊 Status:", vacRes.status);
      console.log("📋 Full Response:", JSON.stringify(vacRes.data, null, 2));
      console.log("💉 Total Vaccines Found:", vacRes?.data?.body?.length || 0);
      
      const vaccines = vacRes?.data?.body || [];
      const availableNames = vaccines.map((v) => v.vaccineName);
      console.log("📝 Available Vaccine Names:", availableNames);
      
      const bestMatch = stringSimilarity.findBestMatch(
        vaccineName,
        availableNames
      ).bestMatch;
      
      console.log("🎯 Fuzzy Matching Results:");
      console.log("🔍 Input Name:", vaccineName);
      console.log("🎯 Best Match:", bestMatch.target);
      console.log("📊 Match Rating:", bestMatch.rating);

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
          `😕 I couldn't find a vaccine named **"${vaccineName}"**.\nHere are your available vaccines:\n\n${list}\n\n👉 Please reply with one of the names above.`,
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
      // 🛡️ FINAL VALIDATION: Use helper function for comprehensive validation
      const finalValidation = validateVaccineScheduleFields({
        date,
        doseTime: fixedDoseTime
      });
      
      if (!finalValidation.isValid) {
        console.log("❌ CONTROLLER: Final validation failed:", finalValidation.errors);
        return sendBotReply(
          chatId,
          userId,
          message,
          getVaccineScheduleValidationGuidance(finalValidation.errors),
          res
        );
      }
      
      try {
        const payload = {
          vaccineId: draftCache[userId].collected.vaccineId,
          date,
          doseTime: fixedDoseTime,
        };

        console.log("🔍 Create Vaccine Schedule API Call Details:");
        console.log("🔗 API URL:", `${config.base_url}/api/v1/vaccine-schedule`);
        console.log("📤 Request Payload:", JSON.stringify(payload, null, 2));
        console.log("🔑 Auth Header:", authHeader ? "Present" : "Missing");

        const saveRes = await axios.post(
          `${config.base_url}/api/v1/vaccine-schedule`,
          payload,
          { headers: { Authorization: authHeader } }
        );

        console.log("✅ Create Vaccine Schedule API Response:");
        console.log("📊 Status:", saveRes.status);
        console.log("📋 Full Response:", JSON.stringify(saveRes.data, null, 2));
        console.log("💬 Response Message:", saveRes?.data?.message || "No message");

        delete draftCache[userId];
        return sendBotReply(
          chatId,
          userId,
          message,
          `${saveRes?.data?.message || "Your vaccine schedule is saved!"}`,
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("Error saving vaccine schedule:", errorMsg);

        // 🛡️ ROBUST ERROR HANDLING - Don't break the flow
        if (errorMsg.includes("already schedule")) {
          // ✅ Provide helpful guidance instead of breaking
          const collected = draftCache[userId].collected;
          let suggestionMessage = "You've already scheduled this vaccine for the same time. ";
          
          if (collected.date && collected.doseTime) {
            suggestionMessage += `Try changing the date from ${collected.date} or time from ${collected.doseTime}. `;
          }
          
          suggestionMessage += "You can:\n";
          suggestionMessage += "• Choose a different date\n";
          suggestionMessage += "• Select a different time\n";
          suggestionMessage += "• Pick a different vaccine\n";
          suggestionMessage += "• Or say 'cancel' to stop";
          
          // 🔄 Keep the flow active but clear collected data for retry
          resetDraftCacheForRetry(userId, "create_vaccine_schedule");

          return sendBotReply(
            chatId,
            userId,
            message,
            suggestionMessage,
            res
          );
        }

        // 🛡️ Handle other API errors gracefully
        if (errorMsg.toLowerCase().includes("validation")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            getErrorGuidance('validation_error'),
            res
          );
        }

        if (errorMsg.toLowerCase().includes("unauthorized") || errorMsg.toLowerCase().includes("forbidden")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            getErrorGuidance('unauthorized'),
            res
          );
        }

        // 🛡️ Generic error with retry option
        return sendBotReply(
          chatId,
          userId,
          message,
          getErrorGuidance('default', { error: errorMsg }),
          res
        );
      }
    }

    return sendBotReply(chatId, userId, message, createIntent.ask, res);
  } catch (err) {
    console.error("Error in handleCreateVaccineSchedule:", err);
    return sendBotReply(
      chatId,
      userId,
      message,
              "Something went wrong while helping you schedule the vaccine. Let's try again.",
      res
    );
  }
};

const getMedicineScheduleHelpMessage = (collected) => {
  const missing = [];
  
  if (!collected.medicineName) missing.push("medicine name");
  if (!collected.quantity) missing.push("quantity");
  if (!collected.startDate) missing.push("start date");
  if (!collected.endDate) missing.push("end date");
  if (!collected.doseTimes || collected.doseTimes.length === 0) missing.push("dose times");
  if (!collected.totalDosesPerDay) missing.push("total doses per day");
  
  if (missing.length === 0) return null;
  
  let helpMessage = "To complete your medicine schedule, I still need:\n";
  missing.forEach((item, index) => {
    helpMessage += `• ${item.charAt(0).toUpperCase() + item.slice(1)}`;
    if (index < missing.length - 1) helpMessage += "\n";
  });
  
  helpMessage += "\n\nYou can also say 'cancel' to stop or 'help' for more guidance.";
  return helpMessage;
};

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

    // Handle help command
    if (/^(help|guidance|what to do|how to|instructions)/i.test(userReply)) {
      const helpMessage = getMedicineScheduleHelpMessage(draftCache[userId]?.collected || {});
      if (helpMessage) {
        return sendBotReply(chatId, userId, message, helpMessage, res);
      } else {
        return sendBotReply(
          chatId,
          userId,
          message,
          "Great! You have all the information needed. I'm creating your medicine schedule now...",
          res
        );
      }
    }

    const createIntent = await detectCreateMedicineScheduleIntentWithOpenAI(
      messageHistory,
      draftCache[userId]?.collected || {}
    );

    console.log("🔍 GPT Function Response:", {
      nextStep: createIntent.nextStep,
      collected: createIntent.collected,
      ask: createIntent.ask
    });

    // 🛡️ CRITICAL FIX: Check if GPT function already provided validation message
    if (createIntent.ask && createIntent.ask.includes("⚠️")) {
      console.log("🔍 GPT function provided validation message:", createIntent.ask);
      // Use the GPT function's validation message directly
      return sendBotReply(chatId, userId, message, createIntent.ask, res);
    }

    if (
      draftCache[userId]?.phase === "create_medicine_schedule" &&
      createIntent.nextStep === "exit"
    ) {
      const priorMessage = messageHistory
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "user");

      const fallbackMessage = priorMessage?.message || message;

      if (/^(yes|cancel|exit|haan|stop|cancel kardo|start over|restart)/i.test(userReply)) {
        delete draftCache[userId];
        // ✅ Simple cancellation message instead of complex fallback
        return sendBotReply(
          chatId,
          userId,
          message,
          "Medicine schedule creation cancelled. How else can I assist you today?",
          res
        );
      }

      if (/^(no|continue|rakho|mat cancel|keep going|continue schedule)/i.test(userReply)) {
        return sendBotReply(
          chatId,
          userId,
          message,
          "Great! Let's continue with your medicine schedule. What would you like to tell me next?",
          res
        );
      }

      if (/^(different|new question|health question|ask something else)/i.test(userReply)) {
        delete draftCache[userId];
        return sendBotReply(
          chatId,
          userId,
          message,
          "Sure! I'm here to help with any health questions. What would you like to know?",
          res
        );
      }

      return sendBotReply(
        chatId,
        userId,
        message,
        createIntent.ask ||
          "I notice you're asking about something different. Would you like to:\n• Continue creating your medicine schedule\n• Cancel and start over\n• Ask a different health question\n\nJust let me know what you'd prefer!",
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

    // 🛡️ IMMEDIATE VALIDATION: Check for decimal numbers and past dates/times
    if (createIntent.collected) {
      console.log("🔍 IMMEDIATE VALIDATION: Checking collected data:", createIntent.collected);
      
      // 🛡️ CRITICAL: Check quantity for decimals (same pattern as handleCreateSupplement)
      if (createIntent.collected.quantity !== undefined && createIntent.collected.quantity !== null) {
        console.log("🔍 Validating quantity:", createIntent.collected.quantity, "Type:", typeof createIntent.collected.quantity);
        
        // Additional type check
        if (typeof createIntent.collected.quantity !== 'number' || isNaN(createIntent.collected.quantity)) {
          console.log("❌ Invalid quantity type in controller:", createIntent.collected.quantity);
          return sendBotReply(
            chatId,
            userId,
            message,
            "❌ Quantity must be a valid number. Please provide a whole number for quantity.",
            res
          );
        }
        
        // Check for decimal numbers (same logic as handleCreateSupplement)
        if (createIntent.collected.quantity % 1 !== 0) {
          console.log("❌ Decimal quantity detected in controller:", createIntent.collected.quantity);
          const errorMessage = "❌ Quantity must be a whole number (no decimals like 3.5, 6.8). Please provide a whole number for quantity.";
          console.log("📤 Sending validation message to user:", errorMessage);
          return sendBotReply(
            chatId,
            userId,
            message,
            errorMessage,
            res
          );
        }
        
        if (createIntent.collected.quantity <= 0) {
          console.log("❌ Invalid quantity (<= 0) in controller:", createIntent.collected.quantity);
          return sendBotReply(
            chatId,
            userId,
            message,
            "❌ Quantity must be greater than 0. Please provide a valid quantity.",
            res
          );
        }
        
        console.log("✅ Quantity validation passed in controller:", createIntent.collected.quantity);
      }

      // 🛡️ FALLBACK: Also check the message content for decimal quantities
      if (message && /\d+\.\d+/.test(message)) {
        const decimalMatch = message.match(/(\d+\.\d+)/);
        if (decimalMatch) {
          console.log("🔍 Fallback: Decimal detected in message:", decimalMatch[1]);
          // Check if this decimal is related to quantity
          if (message.toLowerCase().includes("quantity") || message.toLowerCase().includes("dose") || message.toLowerCase().includes("tablet")) {
            console.log("❌ Fallback: Decimal quantity detected in message content");
            const errorMessage = `❌ Quantity must be a whole number (no decimals like ${decimalMatch[1]}). Please provide a whole number for quantity.`;
            console.log("📤 Sending fallback validation message to user:", errorMessage);
            return sendBotReply(
              chatId,
              userId,
              message,
              errorMessage,
              res
            );
          }
        }
      }

      // 🛡️ FALLBACK: Also check the message content for past dates
      if (message) {
        const messageLower = message.toLowerCase();
        
        // Check for past year patterns (e.g., 2004, 2020, 2023)
        const pastYearMatch = message.match(/(\d{4})/);
        if (pastYearMatch) {
          const year = parseInt(pastYearMatch[1]);
          if (year < 2025) {
            console.log("🔍 Fallback: Past year detected in message:", year);
            
            if (messageLower.includes("start date") || messageLower.includes("start") || messageLower.includes("begin")) {
              console.log("❌ Fallback: Past start date detected in message content");
              const errorMessage = `❌ Start date cannot be in the past (${year} is in the past). Please provide today's date or a future date.`;
              console.log("📤 Sending fallback validation message to user:", errorMessage);
              return sendBotReply(
                chatId,
                userId,
                message,
                errorMessage,
                res
              );
            }
            
            if (messageLower.includes("end date") || messageLower.includes("end") || messageLower.includes("finish")) {
              console.log("❌ Fallback: Past end date detected in message content");
              const errorMessage = `❌ End date cannot be in the past (${year} is in the past). Please provide today's date or a future date.`;
              console.log("📤 Sending fallback validation message to user:", errorMessage);
              return sendBotReply(
                chatId,
                userId,
                message,
                errorMessage,
                res
              );
            }
          }
        }
        
        // Check for past date patterns
        if (messageLower.includes("yesterday") || messageLower.includes("past") || messageLower.includes("ago") || messageLower.includes("last week") || messageLower.includes("last month")) {
          console.log("🔍 Fallback: Past date pattern detected in message");
          if (messageLower.includes("start date") || messageLower.includes("start") || messageLower.includes("begin")) {
            console.log("❌ Fallback: Past start date detected in message content");
            const errorMessage = "❌ Start date cannot be in the past. Please provide today's date or a future date.";
            console.log("📤 Sending fallback validation message to user:", errorMessage);
            return sendBotReply(
              chatId,
              userId,
              message,
              errorMessage,
              res
            );
          }
          if (messageLower.includes("end date") || messageLower.includes("end") || messageLower.includes("finish")) {
            console.log("❌ Fallback: Past end date detected in message content");
            const errorMessage = "❌ End date cannot be in the past. Please provide today's date or a future date.";
            console.log("📤 Sending fallback validation message to user:", errorMessage);
            return sendBotReply(
              chatId,
              userId,
              message,
              errorMessage,
              res
            );
          }
        }
      }

      // Check start date for past dates
      if (createIntent.collected.startDate) {
        console.log("🔍 Validating start date:", createIntent.collected.startDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const startDate = new Date(createIntent.collected.startDate);
        if (startDate < today) {
          console.log("❌ Past start date detected:", createIntent.collected.startDate);
          const errorMessage = "❌ Start date cannot be in the past. Please provide today's date or a future date.";
          console.log("📤 Sending validation message to user:", errorMessage);
          return sendBotReply(
            chatId,
            userId,
            message,
            errorMessage,
            res
          );
        }
        console.log("✅ Start date validation passed:", createIntent.collected.startDate);
      }

      // Check end date for past dates
      if (createIntent.collected.endDate) {
        console.log("🔍 Validating end date:", createIntent.collected.endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const endDate = new Date(createIntent.collected.endDate);
        if (endDate < today) {
          console.log("❌ Past end date detected:", createIntent.collected.endDate);
          const errorMessage = "❌ End date cannot be in the past. Please provide today's date or a future date.";
          console.log("📤 Sending validation message to user:", errorMessage);
          return sendBotReply(
            chatId,
            userId,
            message,
            errorMessage,
            res
          );
        }
        console.log("✅ End date validation passed:", createIntent.collected.endDate);
      }

      // Check dose times for past times
      if (createIntent.collected.doseTimes && Array.isArray(createIntent.collected.doseTimes)) {
        console.log("🔍 Validating dose times:", createIntent.collected.doseTimes);
        console.log("🔍 Start date for context:", createIntent.collected.startDate);
        
        // 🛡️ SMART VALIDATION: Only validate past times if start date is today
        let shouldValidatePastTime = false;
        
        if (createIntent.collected.startDate) {
          const startDate = new Date(createIntent.collected.startDate);
          const today = new Date();
          
          // Check if start date is today (same day)
          if (startDate.getDate() === today.getDate() && 
              startDate.getMonth() === today.getMonth() && 
              startDate.getFullYear() === today.getFullYear()) {
            shouldValidatePastTime = true;
            console.log("🔍 Start date is today - will validate past times");
          } else if (startDate > today) {
            shouldValidatePastTime = false;
            console.log("🔍 Start date is in future - no past time validation needed");
          } else {
            shouldValidatePastTime = true;
            console.log("🔍 Start date is in past - will validate past times");
          }
        } else {
          // No start date provided, use current time for validation
          shouldValidatePastTime = true;
          console.log("🔍 No start date provided - using current time for validation");
        }
        
        if (shouldValidatePastTime) {
          const now = new Date();
          const currentTime = now.getHours() * 60 + now.getMinutes();
          console.log("🔍 Validating against current time:", currentTime);
          
          for (let i = 0; i < createIntent.collected.doseTimes.length; i++) {
            const timeStr = createIntent.collected.doseTimes[i];
            console.log(`🔍 Validating dose time ${i + 1}:`, timeStr);
            
            // Parse time string (handle both 12-hour and 24-hour formats)
            let timeInMinutes;
            if (timeStr.includes('AM') || timeStr.includes('PM')) {
              // 12-hour format
              const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
              if (match) {
                let hour = parseInt(match[1]);
                const minute = parseInt(match[2]) || 0;
                const period = match[3].toUpperCase();
                
                if (period === 'PM' && hour !== 12) hour += 12;
                if (period === 'AM' && hour === 12) hour = 0;
                
                timeInMinutes = hour * 60 + minute;
              }
            } else {
              // 24-hour format
              const match = timeStr.match(/(\d{1,2}):?(\d{2})?/);
              if (match) {
                const hour = parseInt(match[1]);
                const minute = parseInt(match[2]) || 0;
                timeInMinutes = hour * 60 + minute;
              }
            }
            
            if (timeInMinutes !== undefined && timeInMinutes < currentTime) {
              console.log(`❌ Past dose time detected: ${timeStr} (${timeInMinutes} minutes vs current ${currentTime} minutes)`);
              
              // 🛡️ SMART VALIDATION MESSAGE: Explain the context
              let errorMessage;
              if (createIntent.collected.startDate) {
                const startDate = new Date(createIntent.collected.startDate);
                const today = new Date();
                if (startDate.getDate() === today.getDate() && 
                    startDate.getMonth() === today.getMonth() && 
                    startDate.getFullYear() === today.getFullYear()) {
                  errorMessage = `❌ Dose time "${timeStr}" is in the past for today. Please provide a future time since your schedule starts today.`;
                } else {
                  errorMessage = `❌ Dose time "${timeStr}" is in the past. Please provide future times only.`;
                }
              } else {
                errorMessage = `❌ Dose time "${timeStr}" is in the past. Please provide future times only.`;
              }
              
              console.log("📤 Sending validation message to user:", errorMessage);
              return sendBotReply(
                chatId,
                userId,
                message,
                errorMessage,
                res
                );
            }
            console.log(`✅ Dose time ${i + 1} validation passed:`, timeStr);
          }
          console.log("✅ All dose times validation passed");
        } else {
          console.log("✅ Skipping past time validation - start date is in future");
        }
      }
      
      console.log("✅ IMMEDIATE VALIDATION: All checks passed successfully");
    }

    if (collected.medicineName && !draftCache[userId]?.validatedSupplement) {
      try {
        console.log("🔍 ===== MEDICINE LIST API CALL START =====");
        console.log("🔍 User ID:", userId);
        console.log("🔍 Medicine Name to search:", collected.medicineName);
        console.log("🔍 API URL:", `${config.base_url}/api/v1/medicine/list`);
        console.log("🔍 Auth Header:", authHeader ? "Present" : "Missing");
        console.log("🔍 Auth Token:", authHeader?.split(' ')[1] || "No token");
        
        const medRes = await axios.get(
          `${config.base_url}/api/v1/medicine/list`,
          { headers: { Authorization: authHeader } }
        );
        
        console.log("🔍 ===== MEDICINE LIST API RESPONSE =====");
        console.log("🔍 Response Status:", medRes.status);
        console.log("🔍 Response Headers:", medRes.headers);
        console.log("🔍 Full Response Data:", JSON.stringify(medRes.data, null, 2));
        
        const medicines = medRes?.data?.body || [];
        console.log("🔍 Extracted Medicines Array:", medicines);
        console.log("🔍 Total Medicines Found:", medicines.length);
        
        if (medicines.length > 0) {
          console.log("🔍 Available Medicine Names:", medicines.map(m => m.medicineName));
        } else {
          console.log("⚠️ WARNING: Medicines array is empty!");
          console.log("⚠️ Response body structure:", Object.keys(medRes.data || {}));
          console.log("⚠️ Response body.body structure:", Object.keys(medRes.data?.body || {}));
        }
        
        const inputName = collected.medicineName.toLowerCase();
        console.log("🔍 Searching for medicine (normalized):", inputName);

        const match = medicines.find(
          (m) => m.medicineName.toLowerCase() === inputName
        );

        if (!match) {
          const options = medicines
            .map((m) => `💊 ${m.medicineName}`)
            .join("\n");
          return sendBotReply(
            chatId,
            userId,
            message,
            `I couldn't find any medicine named **\"${inputName}\"** in your list.\n\nHere are your available medicines:\n\n${options}\n\nPlease reply with one of the above names.`,
            res
          );
        }

        draftCache[userId].validatedMedicine = match;
        draftCache[userId].collected.medicineName = match.medicineName;
        
        console.log("🔍 ===== MEDICINE VALIDATION COMPLETE =====");
        console.log("🔍 Validated Medicine:", match);
        console.log("🔍 Medicine ID:", match._id);
        console.log("🔍 Medicine Name:", match.medicineName);
      } catch (error) {
        console.error("❌ ===== MEDICINE LIST API ERROR =====");
        console.error("❌ Error fetching medicine list:", error.message);
        console.error("❌ Error details:", error);
        console.error("❌ Error response:", error.response?.data);
        console.error("❌ Error status:", error.response?.status);
        
        return sendBotReply(
          chatId,
          userId,
          message,
          "Sorry, I couldn't fetch your medicine list. Please try again later.",
          res
        );
      }
    }

    // Quantity check logic
    if (
      collected.startDate &&
      collected.endDate &&
      collected.totalDosesPerDay &&
      draftCache[userId]?.validatedMedicine?.quantity !== undefined
    ) {
      const start = new Date(collected.startDate);
      const end = new Date(collected.endDate);
      const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
      const requiredQty = days * collected.totalDosesPerDay;
      const availableQty = draftCache[userId].validatedMedicine.quantity;

      if (requiredQty > availableQty) {
        return sendBotReply(
          chatId,
          userId,
          message,
          `You need ${requiredQty} units but only ${availableQty} are available. Please reduce duration or update stock.`,
          res
        );
      }
    }

    if (
      createIntent.nextStep === "done" &&
      draftCache[userId]?.validatedMedicine?._id &&
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

      // 🛡️ FINAL VALIDATION: Check all fields before saving
      const validation = validateMedicineScheduleFields(collected);
      
      if (!validation.isValid) {
        // ❌ Validation failed - show errors and ask for correction
        const errorMessage = getMedicineScheduleValidationGuidance(validation.errors);
        
        // 🔄 Keep the flow active but ask for correction
        return sendBotReply(
          chatId,
          userId,
          message,
          errorMessage,
          res
        );
      }

      const payload = {
        ...collected,
        medicineName: draftCache[userId].validatedMedicine._id,
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
          "Medicine schedule created successfully!",
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("Error saving medicine schedule:", errorMsg);

        // 🛡️ ROBUST ERROR HANDLING - Don't break the flow
        if (errorMsg.includes("already exists")) {
          // ✅ Provide helpful guidance instead of breaking
          const collected = draftCache[userId].collected;
          let suggestionMessage = "A schedule already exists for this medicine and date range. ";
          
          if (collected.startDate && collected.endDate) {
            suggestionMessage += `Try changing the dates from ${collected.startDate} to ${collected.endDate}. `;
          }
          
          suggestionMessage += "You can:\n";
          suggestionMessage += "• Choose different dates\n";
          suggestionMessage += "• Select a different medicine\n";
          suggestionMessage += "• Or say 'cancel' to stop";
          
          // 🔄 Keep the flow active but clear collected data for retry
          resetDraftCacheForRetry(userId, "create_medicine_schedule");

          return sendBotReply(
            chatId,
            userId,
            message,
            suggestionMessage,
            res
          );
        }

        // 🛡️ Handle other API errors gracefully
        if (errorMsg.toLowerCase().includes("validation")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            getErrorGuidance('validation_error'),
            res
          );
        }

        if (errorMsg.toLowerCase().includes("unauthorized") || errorMsg.toLowerCase().includes("forbidden")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            getErrorGuidance('unauthorized'),
            res
          );
        }

        // 🛡️ Generic error with retry option
        return sendBotReply(
          chatId,
          userId,
          message,
          getErrorGuidance('default', { error: errorMsg }),
          res
        );
      }
    }

    console.log("📤 Sending final response to user:", createIntent.ask);
    return sendBotReply(chatId, userId, message, createIntent.ask, res);
  } catch (error) {
    console.error("Error in handleCreateMedicineSchedule:", error);
    return sendBotReply(
      chatId,
      userId,
      message,
      "Something went wrong. Please try again.",
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
        /^(no|continue|mat cancel|don't cancel|keep going|nahi|continue rakho)/i.test(
          cancelMessage
        )
      ) {
        return sendBotReply(
          chatId,
          userId,
          message,
          "Got it! Let's continue. " +
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

    // 🚀 Handle comprehensive vaccine creation (route to Python backend)
    if (createIntent.nextStep === "comprehensive") {
      try {
        // Extract comprehensive vaccine details from the user's message
        const vaccineDetails = extractVaccineDetailsFromMessage(message);
        
        // Route to Python backend for comprehensive vaccine creation
        console.log("🔍 Python Backend Vaccine API Call Details:");
        console.log("🔗 API URL:", `${process.env.PYTHON_BRIDGE_URL || 'http://localhost:8000'}/api/vaccines`);
        console.log("📤 Request Payload:", JSON.stringify(vaccineDetails, null, 2));
        console.log("🔑 Auth Header:", authHeader ? "Present" : "Missing");
        
        const pythonResponse = await axios.post(
          `${process.env.PYTHON_BRIDGE_URL || 'http://localhost:8000'}/api/vaccines`,
          vaccineDetails,
          {
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': authHeader 
            }
          }
        );

        console.log("✅ Python Backend Vaccine API Response:");
        console.log("📊 Status:", pythonResponse.status);
        console.log("📋 Full Response:", JSON.stringify(pythonResponse.data, null, 2));
        console.log("💬 Response Message:", pythonResponse?.data?.message || "No message");

        delete draftCache[userId];

        return sendBotReply(
          chatId,
          userId,
          message,
          `${pythonResponse.data.message || 'Vaccine created successfully using our advanced system!'}`,
          res
        );
      } catch (err) {
        console.error("Error creating comprehensive vaccine via Python backend:", err);
        
        // Fallback to basic vaccine creation if Python backend fails
        return sendBotReply(
          chatId,
          userId,
          message,
          "I encountered an issue with the advanced system. Let me create a basic vaccine record instead. What's the name of the vaccine?",
          res
        );
      }
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

      console.log("🔍 Create Vaccine API Call Details:");
      console.log("🔗 API URL:", `${config.base_url}/api/v1/vaccine`);
      console.log("📤 Request Payload:", JSON.stringify(payload, null, 2));
      console.log("🔑 Auth Header:", authHeader ? "Present" : "Missing");

      try {
        const createVaccineRes = await axios.post(`${config.base_url}/api/v1/vaccine`, payload, {
          headers: { Authorization: authHeader },
        });

        console.log("✅ Create Vaccine API Response:");
        console.log("📊 Status:", createVaccineRes.status);
        console.log("📋 Full Response:", JSON.stringify(createVaccineRes.data, null, 2));
        console.log("💬 Response Message:", createVaccineRes?.data?.message || "No message");

        delete draftCache[userId];

        return sendBotReply(
          chatId,
          userId,
          message,
          `Vaccine "${payload.vaccineName}" has been added successfully.`,
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("Error creating vaccine:", errorMsg);

        // 🛡️ ROBUST ERROR HANDLING - Don't break the flow
        if (errorMsg.toLowerCase().includes("already exist")) {
          // ✅ Provide helpful guidance instead of breaking
          const guidanceMessage = getErrorGuidance('already_exists', {
            type: 'vaccine',
            name: vaccineName
          });

          // 🔄 Keep the flow active but clear collected data for retry
          resetDraftCacheForRetry(userId, "create_vaccine");

          return sendBotReply(
            chatId,
            userId,
            message,
            guidanceMessage,
            res
          );
        }

        // 🛡️ Handle other API errors gracefully
        if (errorMsg.toLowerCase().includes("validation")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            getErrorGuidance('validation_error'),
            res
          );
        }

        if (errorMsg.toLowerCase().includes("unauthorized") || errorMsg.toLowerCase().includes("forbidden")) {
          return sendBotReply(
            chatId,
            userId,
            message,
            getErrorGuidance('unauthorized'),
            res
          );
        }

        // 🛡️ Generic error with retry option
        return sendBotReply(
          chatId,
          userId,
          message,
          getErrorGuidance('default', { error: errorMsg }),
          res
        );
      }
    }

    // ⏭ Ask for next field if required fields aren't ready
    return sendBotReply(chatId, userId, message, createIntent.ask, res);
  } catch (err) {
    console.error("Error in handleCreateVaccine:", err);
    
    // 🛡️ CRITICAL: Don't break the flow even on system errors
    const errorMessage = `⚠️ Something went wrong while processing your request. 

Don't worry! You can:
• Try again with the same information
• Provide the details again
• Say 'cancel' to start over

What would you like to do?`;

    return sendBotReply(
      chatId,
      userId,
      message,
      errorMessage,
      res
    );
  }
};

// Helper function to extract vaccine details from user message
const extractVaccineDetailsFromMessage = (message) => {
  const details = {};
  
  // Extract vaccine name
  const nameMatch = message.match(/name:\s*([^,]+)/i);
  if (nameMatch) details.name = nameMatch[1].trim();
  
  // Extract dosage
  const dosageMatch = message.match(/dosage:\s*([^,]+)/i);
  if (dosageMatch) details.dosage = dosageMatch[1].trim();
  
  // Extract purpose/description
  const purposeMatch = message.match(/purpose:\s*([^,]+)/i);
  if (purposeMatch) details.description = purposeMatch[1].trim();
  
  // Extract manufacturer
  const manufacturerMatch = message.match(/created by:\s*([^,]+)/i);
  if (manufacturerMatch) details.manufacturer = manufacturerMatch[1].trim();
  
  // Extract price
  const priceMatch = message.match(/price:\s*\$?([^,]+)/i);
  if (priceMatch) details.price = priceMatch[1].trim();
  
  // Extract quantity
  const quantityMatch = message.match(/quantity:\s*(\d+)/i);
  if (quantityMatch) details.quantity = parseInt(quantityMatch[1]);
  
  // Extract brand
  const brandMatch = message.match(/brand:\s*([^,]+)/i);
  if (brandMatch) details.brand_name = brandMatch[1].trim();
  
  // Extract expiration
  const expMatch = message.match(/expiration:\s*([^,]+)/i);
  if (expMatch) details.expiration_date = expMatch[1].trim();
  
  // Extract age group
  const ageMatch = message.match(/age group:\s*([^,]+)/i);
  if (ageMatch) details.age_group = ageMatch[1].trim();
  
  return details;
};

// Helper function to extract supplement details from user message
const extractSupplementDetailsFromMessage = (message) => {
  const details = {};
  
  // Extract medicine name
  const nameMatch = message.match(/name:\s*([^,]+)/i);
  if (nameMatch) details.medicineName = nameMatch[1].trim();
  
  // Extract dosage
  const dosageMatch = message.match(/dosage:\s*([^,]+)/i);
  if (dosageMatch) details.dosage = dosageMatch[1].trim();
  
  // Extract purpose/takenForSymptoms
  const purposeMatch = message.match(/purpose:\s*([^,]+)/i);
  if (purposeMatch) details.takenForSymptoms = purposeMatch[1].trim();
  
  // Extract manufacturer
  const manufacturerMatch = message.match(/created by:\s*([^,]+)/i);
  if (manufacturerMatch) details.manufacturer = manufacturerMatch[1].trim();
  
  // Extract price
  const priceMatch = message.match(/price:\s*\$?([^,]+)/i);
  if (priceMatch) details.price = priceMatch[1].trim();
  
  // Extract quantity
  const quantityMatch = message.match(/quantity:\s*(\d+)/i);
  if (quantityMatch) details.quantity = parseInt(quantityMatch[1]);
  
  // Extract brand
  const brandMatch = message.match(/brand:\s*([^,]+)/i);
  if (brandMatch) details.brand_name = brandMatch[1].trim();
  
  // Extract expiration
  const expMatch = message.match(/expiration:\s*([^,]+)/i);
  if (expMatch) details.expDate = expMatch[1].trim();
  
  // Extract description
  const descMatch = message.match(/description:\s*([^,]+)/i);
  if (descMatch) details.description = descMatch[1].trim();
  
  return details;
};

const handleCreateSupplement = async (
  message,
  chatId,
  sessionId, // This is the sessionId passed from the main function
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
    if (draftCache[sessionId]?.phase !== "create_supplement") {
      delete draftCache[sessionId];
    }
    const userReply = message.toLowerCase();

    // 🔁 Exit handling
    if (
      draftCache[sessionId]?.phase === "create_supplement" &&
      draftCache[sessionId]?.suggestedField &&
      /^(yes|haan|sahi|correct|thik hai)$/i.test(userReply)
    ) {
      draftCache[sessionId].collected[draftCache[sessionId].suggestedField] =
        draftCache[sessionId].suggestedValue;
      delete draftCache[sessionId].suggestedField;
      delete draftCache[sessionId].suggestedValue;
    }

    const supplementIntent = await detectCreateSupplementIntentWithOpenAI(
      messageHistory,
      draftCache[sessionId]?.collected || {}
    );

    console.log("🟢 supplementIntent:", supplementIntent);
    console.log("🟢 Current draftCache:", draftCache[sessionId]);
    console.log("🟢 User message:", message);
    console.log("🟢 SessionId:", sessionId);

    // 🛡️ IMMEDIATE VALIDATION: Check for decimal numbers in collected data
    if (supplementIntent.collected) {
      // Check price for decimals
      if (supplementIntent.collected.price !== undefined && supplementIntent.collected.price !== null) {
        if (supplementIntent.collected.price % 1 !== 0) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            "❌ Price must be a whole number (no decimals like 3.5, 8.9). Please provide a whole number for price.",
            res
          );
        }
        if (supplementIntent.collected.price <= 0) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            "❌ Price must be greater than 0. Please provide a valid price.",
            res
          );
        }
      }

      // Check quantity for decimals
      if (supplementIntent.collected.quantity !== undefined && supplementIntent.collected.quantity !== null) {
        if (supplementIntent.collected.quantity % 1 !== 0) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            "❌ Quantity must be a whole number (no decimals like 3.5, 8.9). Please provide a whole number for quantity.",
            res
          );
        }
        if (supplementIntent.collected.quantity <= 0) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            "❌ Quantity must be greater than 0. Please provide a valid quantity.",
            res
          );
        }
      }

      // Check dosage for decimals
      if (supplementIntent.collected.dosage !== undefined && supplementIntent.collected.dosage !== null) {
        if (typeof supplementIntent.collected.dosage === 'string' && /\d+\.\d+/.test(supplementIntent.collected.dosage)) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            "❌ Dosage must be a whole number (no decimals like 3.5, 8.9). Please provide dosage like '500mg', '2 tablets', '10 capsules' without decimals.",
            res
          );
        }
      }

      // Check expiry date for past dates
      if (supplementIntent.collected.expDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const expiryDate = new Date(supplementIntent.collected.expDate);
        if (expiryDate < today) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            "❌ Expiry date cannot be in the past. Please provide a future date for expiry.",
            res
          );
        }
      }

      // Check manufacturing date for future dates
      if (supplementIntent.collected.mfgDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const mfgDateObj = new Date(supplementIntent.collected.mfgDate);
        if (mfgDateObj > today) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            "❌ Manufacturing date cannot be in the future. Please provide a past or current date.",
            res
          );
        }
      }
    }

    if (
      draftCache[sessionId]?.phase === "create_supplement" &&
      supplementIntent.nextStep === "exit"
    ) {
      const priorMessage = messageHistory
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "user");
      const fallbackMessage = priorMessage?.message || message;

      if (/^(yes|cancel|haan|cancel kardo|exit|stop)/i.test(userReply)) {
        delete draftCache[sessionId];
        return await getSafeFallbackReply(
          chatId,
          sessionId, // Use sessionId here too
          message,
          fallbackMessage,
          res,
          "create_supplement"
        );
      }

      if (
        /^(no|mat cancel|continue|rakho|don't stop|keep going)/i.test(userReply)
      ) {
        return sendBotReply(
          chatId,
          sessionId, // Use sessionId here too
          message,
          "Great, let's continue with supplement creation.",
          res
        );
      }

      return sendBotReply(
        chatId,
        sessionId, // Use sessionId here too
        message,
        supplementIntent.ask || "Should I cancel supplement creation?",
        res
      );
    }

    // 💾 Update draft
    draftCache[sessionId] = {
      phase: "create_supplement",
      collected: {
        ...draftCache[sessionId]?.collected,
        ...supplementIntent.collected,
      },
    };

    // ✅ Clear suggestion if overridden
    if (supplementIntent.nextStep !== draftCache[sessionId]?.suggestedField) {
      delete draftCache[sessionId].suggestedField;
      delete draftCache[sessionId].suggestedValue;
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
    } = draftCache[sessionId].collected;



    // ✅ Require all 7 required fields before saving; otherwise continue collecting
    if (supplementIntent.nextStep === "done" || (medicineName && dosage && price && quantity && singlePack && mfgDate && expDate)) {
      
      // 🛡️ VALIDATION: Check all fields before saving
      const validation = validateMedicineFields({
        price,
        quantity,
        mfgDate,
        expDate
      });
      
      if (!validation.isValid) {
        // ❌ Validation failed - show errors and ask for correction
        const errorMessage = getValidationGuidance(validation.errors);
        
        // 🔄 Keep the flow active but ask for correction
        return sendBotReply(
          chatId,
          sessionId,
          message,
          errorMessage,
          res
        );
      }
      
      // Check if this is a comprehensive supplement creation that should go to Python backend
      const hasComprehensiveDetails = message.includes("brand:") || message.includes("manufacturer:") || 
                                   message.includes("expiration:") || message.includes("exp:");
      
      if (hasComprehensiveDetails) {
        try {
          // Extract comprehensive supplement details from the user's message
          const supplementDetails = extractSupplementDetailsFromMessage(message);
          
          // Route to Python backend for comprehensive supplement creation
          const pythonResponse = await axios.post(
            `${process.env.PYTHON_BRIDGE_URL || 'http://localhost:8000'}/api/supplements/comprehensive`,
            supplementDetails,
            {
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': authHeader 
              }
            }
          );

          delete draftCache[sessionId];

          return sendBotReply(
            chatId,
            sessionId,
            message,
            `${pythonResponse.data.message || 'Supplement created successfully using our advanced system!'}`,
            res
          );
        } catch (err) {
          console.error("Error creating comprehensive supplement via Python backend:", err);
          
          // Fallback to basic supplement creation if Python backend fails
          console.log("Falling back to basic supplement creation...");
        }
      }
      
      // Basic supplement creation (existing logic)
      const payload = {
        medicineName,
        dosage,
        price,
        quantity,
        singlePack: String(singlePack),
        mfgDate,
        expDate,
        ...(description && { description }),
        ...(takenForSymptoms && { takenForSymptoms }),
        ...(associatedRisks && { associatedRisks }),
      };

      try {
        await axios.post(`${config.base_url}/api/v1/medicine/add`, payload, {
          headers: { Authorization: authHeader },
        });

        delete draftCache[sessionId];
        return sendBotReply(
          chatId,
          sessionId,
          message,
          `Medicine "${payload.medicineName}" has been created successfully.`,
          res
        );
      } catch (err) {
        const errorMsg = err?.response?.data?.message || "";
        console.error("Error creating supplement:", errorMsg);

        // 🛡️ ROBUST ERROR HANDLING - Don't break the flow
        if (errorMsg.includes("already exists")) {
          // ✅ Provide helpful guidance instead of breaking
          const guidanceMessage = getErrorGuidance('already_exists', {
            type: 'supplement'
          });

          // 🔄 Keep the flow active but clear collected data for retry
          resetDraftCacheForRetry(sessionId, "create_supplement");

          return sendBotReply(
            chatId,
            sessionId,
            message,
            guidanceMessage,
            res
          );
        }

        // 🛡️ Handle other API errors gracefully
        if (errorMsg.toLowerCase().includes("validation")) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            getErrorGuidance('validation_error'),
            res
          );
        }

        if (errorMsg.toLowerCase().includes("unauthorized") || errorMsg.toLowerCase().includes("forbidden")) {
          return sendBotReply(
            chatId,
            sessionId,
            message,
            getErrorGuidance('unauthorized'),
            res
          );
        }

        // 🛡️ Generic error with retry option
        return sendBotReply(
          chatId,
          sessionId,
          message,
          getErrorGuidance('default', { error: errorMsg }),
          res
        );
      }
    }

    // If nextStep is "done" but we still have missing fields, use the ask message from intent
    if (supplementIntent.nextStep === "done") {
      return sendBotReply(chatId, sessionId, message, supplementIntent.ask, res);
    }

    // Ask for whatever is still missing from the required fields
    const missing = [];
    if (!medicineName) missing.push("medicine name");
    if (!dosage) missing.push("dosage");
    if (!price) missing.push("price");
    if (!quantity) missing.push("quantity");
    if (!singlePack) missing.push("single pack details");
    if (!mfgDate) missing.push("manufacturing date");
    if (!expDate) missing.push("expiry date");
    if (missing.length)
      return sendBotReply(
        chatId,
        sessionId,
        message,
        `Please provide: ${missing.join(", ")}. You can send multiple together.`,
        res
      );

    return sendBotReply(chatId, sessionId, message, supplementIntent.ask, res);
  } catch (err) {
    console.error("Error in handleCreateSupplement:", err);
    return sendBotReply(
      chatId,
      sessionId,
      message,
              "Something went wrong while processing the supplement creation.",
      res
    );
  }
};

// 🛡️ Helper function to provide better user guidance
const getErrorGuidance = (errorType, context = {}) => {
  const baseMessage = "I encountered an issue while processing your request.";
  
  switch (errorType) {
    case 'already_exists':
      if (context.type === 'vaccine') {
        return `Vaccine "${context.name}" already exists in your records. 

You can:
• Try a different vaccine name
• Use a different provider
• Add a description to make it unique
• Or say 'cancel' to stop

What would you like to do?`;
      } else if (context.type === 'supplement') {
        return `This supplement already exists in your records. 

You can:
• Try a different medicine name
• Use a different dosage or brand
• Add unique details (different manufacturer, expiry date)
• Or say 'cancel' to stop

What would you like to do?`;
      } else if (context.type === 'schedule') {
        return `A schedule already exists for this ${context.itemType} and date range. 

You can:
• Choose different dates
• Select a different ${context.itemType}
• Or say 'cancel' to stop

What would you like to do?`;
      }
      break;
      
    case 'validation_error':
      return `There's an issue with the details you provided. Please check:
• All required fields are filled
• Dates are in YYYY-MM-DD format
• Times are valid (e.g., 10:30 AM)
• Try again with corrected information`;
      
    case 'unauthorized':
      return `Access denied. Please check your login and try again.`;
      
    case 'network_error':
      return `I'm having trouble connecting to the system. 

You can:
• Try again in a moment
• Check your internet connection
• Or say 'cancel' to stop

What would you like to do?`;
      
    default:
      return `Something went wrong. 

You can:
• Try again
• Provide different information
• Say 'cancel' to stop

What would you like to do?`;
  }
  
  return `Something went wrong. 

You can:
• Try again
• Provide different information
• Say 'cancel' to stop

What would you like to do?`;
};

// 🛡️ Helper function to reset draft cache for retry
const resetDraftCacheForRetry = (sessionId, phase) => {
  draftCache[sessionId] = {
    phase: phase,
    collected: {}, // Reset for fresh attempt
  };
  console.log(`🔄 Reset draft cache for ${phase} retry`);
};

// 🛡️ Validation functions for medicine creation
const validateMedicineFields = (collected) => {
  const errors = [];
  
  // ✅ Check for decimal numbers in price, quantity
  if (collected.price !== undefined && collected.price !== null) {
    if (collected.price % 1 !== 0) {
      errors.push("Price must be a whole number (no decimals like 3.5, 8.9)");
    }
    if (collected.price <= 0) {
      errors.push("Price must be greater than 0");
    }
  }
  
  if (collected.quantity !== undefined && collected.quantity !== null) {
    if (collected.quantity % 1 !== 0) {
      errors.push("Quantity must be a whole number (no decimals like 3.5, 8.9)");
    }
    if (collected.quantity <= 0) {
      errors.push("Quantity must be greater than 0");
    }
  }
  
  // ✅ Check for past expiry date
  if (collected.expDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day
    
    const expiryDate = new Date(collected.expDate);
    if (expiryDate < today) {
      errors.push("Expiry date cannot be in the past. Please provide a future date.");
    }
  }
  
  // ✅ Check for past manufacturing date (optional warning)
  if (collected.mfgDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const mfgDate = new Date(collected.mfgDate);
    if (mfgDate > today) {
      errors.push("Manufacturing date cannot be in the future. Please provide a past or current date.");
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

// 🛡️ Helper function to provide validation error guidance for medicine schedule
const getMedicineScheduleValidationGuidance = (errors) => {
  let message = "Please correct the following issues:\n\n";
  
  errors.forEach((error, index) => {
    message += `• ${error}`;
    if (index < errors.length - 1) message += "\n";
  });
  
  message += "\n\nPlease provide corrected information:";
  
  return message;
};

// 🛡️ Helper function to provide validation error guidance
const getValidationGuidance = (errors) => {
  let message = "Please correct the following issues:\n\n";
  
  errors.forEach((error, index) => {
    message += `• ${error}`;
    if (index < errors.length - 1) message += "\n";
  });
  
  message += "\n\nPlease provide corrected information:";
  
  return message;
};

const getSafeFallbackReply = async (
  chatId,
  sessionId, // Changed from userId to sessionId for consistency
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
        `Switching from cancelled '${previousPhase}' to new intent '${newIntent}'`
      );

      delete draftCache[sessionId]; // reset old flow - use sessionId

      // Re-trigger main flow with new message
      return await chatWithHealthBot(
        {
          body: { message: fallbackMessage, chatId },
          headers: { authorization: authHeader },
          user: { _id: sessionId }, // Use sessionId here too
        },
        res
      );
    }

    // 🧠 Fallback to general health bot reply
    // const fallbackReply = await getHealthGPTResponse(fallbackMessage);

    // Show simple cancellation message instead of long GPT response
    return sendBotReply(
      chatId,
      sessionId, // Use sessionId here too
      message,
      "Action has been cancelled. How else can I assist you today?",
      res
    );
  } catch (error) {
    console.error("Error in getSafeFallbackReply:", error);
    return sendBotReply(
      chatId,
      sessionId, // Use sessionId here too
      message,
              "Something went wrong while processing your request.",
      res
    );
  }
};

const handleCreateHealthScore = async (
  message,
  chatId,
  sessionId, // Changed from userId to sessionId for consistency
  authHeader,
  res
) => {
  try {
    const chatData = await ChatHistory.findById(chatId).lean();
    const messageHistory = chatData?.messages || [];

    messageHistory.push({ role: "user", message });

    const cacheKey = `${sessionId}_health_score`; // Use sessionId here
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
    //     /^(no|mat cancel|continue|rakho|don't stop|keep going)/i.test(userReply)
    //   ) {
    //     return sendBotReply(
    //       chatId,
    //       userId,
    //       message,
    //       "👍 Great, let's continue with health score calculation.",
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
        // ✅ Simple cancellation message instead of complex fallback
        return sendBotReply(
          chatId,
          sessionId,
          message,
          "Health score calculation cancelled. How else can I assist you today?",
          res
        );
      }

      if (
        /^(no|continue|mat cancel|don't cancel|keep going|nahi|continue rakho)/i.test(
          cancelMessage
        )
      ) {
        const followUp =
          Object.keys(draftCache[cacheKey]?.answers || {}).length === 0
                          ? "Okay! Let's start with your health score. How many steps do you take daily?"
            : "Great! Let's continue with your health score calculation.";

        return sendBotReply(chatId, sessionId, message, followUp, res);
      }

      return sendBotReply(
        chatId,
        sessionId,
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
        sessionId,
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
        console.error("Failed to save health score:", err.message);
        delete draftCache[cacheKey];
        return sendBotReply(
          chatId,
          sessionId,
          message,
          "I couldn't save your health score. Please try again later.",
          res
        );
      }

      delete draftCache[cacheKey];
      return sendBotReply(
        chatId,
        sessionId,
        message,
        healthScoreResult.message || "Your health score has been saved.",
        res
      );
    }

    return sendBotReply(
      chatId,
      sessionId,
      message,
              "Something went wrong. Please try again.",
      res
    );
  } catch (error) {
    console.error("handleCreateHealthScore error:", error.message);
    const cacheKey = `${sessionId}_health_score`; // Use sessionId here
    delete draftCache[cacheKey];
    return sendBotReply(
      chatId,
      sessionId,
      message,
              "Something went wrong while calculating your health score. Please try again.",
      res
    );
  }
};

// 🧹 Graceful shutdown cleanup
process.on('SIGINT', () => {
  console.log('🧹 Cleaning up resources before shutdown...');
  clearInterval(cleanupInterval);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🧹 Cleaning up resources before shutdown...');
  clearInterval(cleanupInterval);
  process.exit(0);
});

// 🛡️ Helper function to validate medicine schedule fields
const validateMedicineScheduleFields = (collected) => {
  const errors = [];
  
  // Check quantity for decimals
  if (collected.quantity !== undefined && collected.quantity !== null) {
    if (collected.quantity % 1 !== 0) {
      errors.push("Quantity must be a whole number (no decimals like 3.5, 6.8)");
    }
    if (collected.quantity <= 0) {
      errors.push("Quantity must be greater than 0");
    }
  }
  
  // Check start date for past dates
  if (collected.startDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDate = new Date(collected.startDate);
    if (startDate < today) {
      errors.push("Start date cannot be in the past");
    }
  }
  
  // Check end date for past dates
  if (collected.endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endDate = new Date(collected.endDate);
    if (endDate < today) {
      errors.push("End date cannot be in the past");
    }
  }
  
  // Check dose times for past times
  if (collected.doseTimes && Array.isArray(collected.doseTimes)) {
    console.log("🔍 HELPER: Validating dose times:", collected.doseTimes);
    console.log("🔍 HELPER: Start date for context:", collected.startDate);
    
    // 🛡️ SMART VALIDATION: Only validate past times if start date is today
    let shouldValidatePastTime = false;
    
    if (collected.startDate) {
      const startDate = new Date(collected.startDate);
      const today = new Date();
      
      // Check if start date is today (same day)
      if (startDate.getDate() === today.getDate() && 
          startDate.getMonth() === today.getMonth() && 
          startDate.getFullYear() === today.getFullYear()) {
        shouldValidatePastTime = true;
        console.log("🔍 HELPER: Start date is today - will validate past times");
      } else if (startDate > today) {
        shouldValidatePastTime = false;
        console.log("🔍 HELPER: Start date is in future - no past time validation needed");
      } else {
        shouldValidatePastTime = true;
        console.log("🔍 HELPER: Start date is in past - will validate past times");
      }
    } else {
      // No start date provided, use current time for validation
      shouldValidatePastTime = true;
      console.log("🔍 HELPER: No start date provided - using current time for validation");
    }
    
    if (shouldValidatePastTime) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      console.log("🔍 HELPER: Validating against current time:", currentTime);
      
      for (let i = 0; i < collected.doseTimes.length; i++) {
        const timeStr = collected.doseTimes[i];
        console.log(`🔍 HELPER: Validating dose time ${i + 1}:`, timeStr);
        
        // Parse time string (handle both 12-hour and 24-hour formats)
        let timeInMinutes;
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
          // 12-hour format
          const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
          if (match) {
            let hour = parseInt(match[1]);
            const minute = parseInt(match[2]) || 0;
            const period = match[3].toUpperCase();
            
            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;
            
            timeInMinutes = hour * 60 + minute;
          }
        } else {
          // 24-hour format
          const match = timeStr.match(/(\d{1,2}):?(\d{2})?/);
          if (match) {
            const hour = parseInt(match[1]);
            const minute = parseInt(match[2]) || 0;
            timeInMinutes = hour * 60 + minute;
          }
        }
        
        if (timeInMinutes !== undefined && timeInMinutes < currentTime) {
          console.log(`❌ HELPER: Past dose time detected: ${timeStr} (${timeInMinutes} minutes vs current ${currentTime} minutes)`);
          
          // 🛡️ SMART VALIDATION MESSAGE: Explain the context
          if (collected.startDate) {
            const startDate = new Date(collected.startDate);
            const today = new Date();
            if (startDate.getDate() === today.getDate() && 
                startDate.getMonth() === today.getMonth() && 
                startDate.getFullYear() === today.getFullYear()) {
              errors.push(`Dose time "${timeStr}" is in the past for today. Please provide a future time since your schedule starts today`);
            } else {
              errors.push(`Dose time "${timeStr}" is in the past`);
            }
          } else {
            errors.push(`Dose time "${timeStr}" is in the past`);
          }
        } else {
          console.log(`✅ HELPER: Dose time ${i + 1} validation passed:`, timeStr);
        }
      }
      console.log("✅ HELPER: All dose times validation completed");
    } else {
      console.log("✅ HELPER: Skipping past time validation - start date is in future");
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

// 🛡️ Helper function to validate vaccine schedule fields
const validateVaccineScheduleFields = (collected) => {
  const errors = [];
  
  // Check date for past dates
  if (collected.date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const scheduleDate = new Date(collected.date);
    if (scheduleDate < today) {
      errors.push("Vaccine schedule date cannot be in the past");
    }
  }
  
  // Check dose time for past times (only if date is today)
  if (collected.doseTime && collected.date) {
    const scheduleDate = new Date(collected.date);
    const today = new Date();
    
    // Check if schedule date is today
    if (scheduleDate.getDate() === today.getDate() &&
        scheduleDate.getMonth() === today.getMonth() &&
        scheduleDate.getFullYear() === today.getFullYear()) {
      
      console.log("🔍 HELPER: Vaccine schedule date is today, validating dose time");
      
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      // Parse time string
      let timeInMinutes;
      const timeStr = collected.doseTime;
      
      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        // 12-hour format
        const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
        if (match) {
          let hour = parseInt(match[1]);
          const minute = parseInt(match[2]) || 0;
          const period = match[3].toUpperCase();

          if (period === 'PM' && hour !== 12) hour += 12;
          if (period === 'AM' && hour === 12) hour = 0;

          timeInMinutes = hour * 60 + minute;
        }
      } else {
        // 24-hour format
        const match = timeStr.match(/(\d{1,2}):?(\d{2})?/);
        if (match) {
          const hour = parseInt(match[1]);
          const minute = parseInt(match[2]) || 0;
          timeInMinutes = hour * 60 + minute;
        }
      }
      
      if (timeInMinutes !== undefined && timeInMinutes < currentTime) {
        console.log(`❌ HELPER: Past dose time detected: ${timeStr} (${timeInMinutes} minutes vs current ${currentTime} minutes)`);
        errors.push(`Dose time "${timeStr}" is in the past for today. Please provide a future time since your vaccine is scheduled for today`);
      } else {
        console.log(`✅ HELPER: Dose time validation passed:`, timeStr);
      }
    } else {
      console.log("✅ HELPER: Skipping past time validation - schedule date is in future");
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

// 🛡️ Helper function to get vaccine schedule validation guidance
const getVaccineScheduleValidationGuidance = (errors) => {
  if (errors.length === 0) return "";
  
  let guidance = "⚠️ Please fix the following issues:\n";
  errors.forEach((error, index) => {
    guidance += `${index + 1}. ${error}\n`;
  });
  guidance += "\nPlease provide the correct information to continue.";
  
  return guidance;
};

// 🧹 Simple Clear User Cache API
const clearUserCache = async (req, res) => {
  try {
    const userId = req.user?._id;
    const sessionId = userId || req.headers['x-anon-token'] || req.ip;
    
    if (!sessionId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "User session not found",
        data: null,
      });
    }

    console.log("🧹 Clearing cache for user:", sessionId);

    // Clear all caches for this user
    let clearedCount = 0;

    // 1. Clear draft cache
    if (draftCache[sessionId]) {
      delete draftCache[sessionId];
      clearedCount++;
    }

    // 2. Clear session messages
    if (sessionMessages[sessionId]) {
      delete sessionMessages[sessionId];
      clearedCount++;
    }

    // 3. Clear health score cache
    const healthScoreCacheKey = `${sessionId}_health_score`;
    if (draftCache[healthScoreCacheKey]) {
      delete draftCache[healthScoreCacheKey];
      clearedCount++;
    }

    // 4. Clear rate limiter
    if (rateLimiter.has(sessionId)) {
      rateLimiter.delete(sessionId);
      clearedCount++;
    }

    // 5. Clear any other session-specific caches
    Object.keys(draftCache).forEach(key => {
      if (key.includes(sessionId)) {
        delete draftCache[key];
        clearedCount++;
      }
    });

    console.log("✅ Cache cleared successfully for user:", sessionId);

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Cache cleared successfully! You now have a fresh chat experience.",
      data: {
        clearedCaches: clearedCount,
        sessionId: sessionId
      },
    });

  } catch (error) {
    console.error("Error clearing user cache:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to clear cache. Please try again.",
      data: null,
    });
  }
};

export { handleCreateSupplement, handleCheckMedicineSchedule, clearUserCache };

export default {
  chatWithHealthBot,
  testSafetyEndpoint,
  clearUserCache,
};

// 🛡️ CRITICAL: Global error handler for unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't crash the application, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't crash the application, just log the error
});

// 🚨 Safety monitoring and alerting
const logSafetyViolation = async (violationData) => {
  try {
    // Log to console for immediate monitoring
    console.log("🚨 SAFETY VIOLATION LOG:", {
      timestamp: new Date().toISOString(),
      severity: violationData.severity,
      message: violationData.message,
      pattern: violationData.pattern,
      ip: violationData.ip,
      userId: violationData.userId,
      userAgent: violationData.userAgent,
      sessionId: violationData.sessionId
    });
    
    // In production, you might want to:
    // 1. Send alerts to admin team
    // 2. Store in a dedicated safety violations database
    // 3. Implement rate limiting for repeat offenders
    // 4. Send notifications to security team
    
    // Example: Store in database for analysis
    // await SafetyViolation.create(violationData);
    
  } catch (error) {
    console.error("Failed to log safety violation:", error);
  }
};

