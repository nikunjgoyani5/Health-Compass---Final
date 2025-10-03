import { OpenAI } from "openai";
import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import { z } from "zod";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ Minimal add: central model + JSON-mode guard
const MODEL = process.env.OPENAI_MODEL || "gpt-4";

const JSON_MODE_ALLOWLIST = [
  "gpt-3.5-turbo-1106",
  "gpt-4-1106-preview",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "o3",
  "o4"
];

const supportsJsonMode = (m = MODEL) =>
  JSON_MODE_ALLOWLIST.some(x => m.toLowerCase().startsWith(x.toLowerCase()));


export const normalizeDate = (inputText) => {
  try {
    const parsed = chrono.parseDate(inputText, new Date(), {
      forwardDate: true,
    });
    if (!parsed) return null;
    return parsed.toISOString().split("T")[0];
  } catch (err) {
    console.error("Failed to normalize date:", inputText, err);
    return null;
  }
};

// 🛡️ Safe date parsing with fallbacks
export const safeDateParse = (input) => {
  if (!input || typeof input !== 'string') return null;
  
  try {
    // Try chrono first
    const parsed = chrono.parseDate(input, { timezone: "Asia/Kolkata" });
    if (parsed) {
      const iso = parsed.toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];
      
      // Ensure date is not in the past
      if (iso >= today) {
        return iso;
      }
    }
    
    // Fallback: Try to parse common date formats
    const commonFormats = [
      /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
      /(\d{1,2})-(\d{1,2})-(\d{4})/, // DD-MM-YYYY
    ];
    
    for (const format of commonFormats) {
      const match = input.match(format);
      if (match) {
        let year, month, day;
        
        if (format.source.includes('YYYY')) {
          // YYYY-MM-DD format
          [, year, month, day] = match;
        } else {
          // MM/DD/YYYY or DD-MM-YYYY format
          [, month, day, year] = match;
        }
        
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          const iso = date.toISOString().split("T")[0];
          const today = new Date().toISOString().split("T")[0];
          
          if (iso >= today) {
            return iso;
          }
        }
      }
    }
    
    return null;
  } catch (err) {
    console.error("Safe date parsing failed:", input, err);
    return null;
  }
};

// 🚨 Safety check for harmful content in GPT responses
const checkResponseSafety = (response) => {
  const harmfulPatterns = [
    /\b(bomb|explosive|weapon|gun|knife|poison|toxic|lethal|deadly)\b/i,
    /\b(suicide|self.harm|kill.myself|end.life|take.life)\b/i,
    /\b(violence|violent|harm|hurt|destroy|murder|assassinate)\b/i,
    /\b(illegal|crime|criminal|fraud|hack|terrorism|terrorist)\b/i,
    /\b(overdose|excessive.dose|dangerous.dose|mix.medicines)\b/i
  ];
  
  const responseText = typeof response === 'string' ? response : JSON.stringify(response);
  
  for (const pattern of harmfulPatterns) {
    if (pattern.test(responseText)) {
      return {
        isUnsafe: true,
        matchedPattern: pattern.toString()
      };
    }
  }
  
  return { isUnsafe: false };
};

export const getHealthGPTResponse = async (input, options = {}) => {
  try {
    // Build messages allowing optional conversation history
    const systemMessage = {
      role: "system",
      content: `
You are HealthBot, a highly skilled healthcare and medicine expert.

You provide clear, accurate, and professional advice on:
- Symptoms and medical concerns
- Common diseases and conditions
- Over-the-counter (OTC) medicines
- First aid guidance
- Fitness, exercise, and wellness routines
- Diet and nutrition plans
- Mental health support

🚨 CRITICAL SAFETY RULES (MUST FOLLOW):
- NEVER prescribe prescription medicines or antibiotics
- ALWAYS recommend consulting a doctor for serious symptoms
- For fever > 103°F (39.4°C), chest pain, severe bleeding, seizures → IMMEDIATE HOSPITAL
- Suggest only OTC medicines for minor issues
- Include dosage warnings (e.g., "Don't exceed 4 doses in 24 hours")
- Mention common side effects for OTC medicines
- Suggest natural alternatives when possible
- Include age-specific recommendations

🛡️ SAFETY & ETHICAL GUIDELINES:
- NEVER provide information about weapons, explosives, or dangerous substances
- NEVER provide instructions for self-harm, suicide, or violence
- NEVER provide information about illegal activities or criminal behavior
- NEVER provide adult or inappropriate content
- If asked about harmful topics, politely decline and redirect to appropriate resources
- Always prioritize user safety and well-being
- Report any concerning requests to appropriate authorities if necessary

💊 MEDICINE GUIDELINES:
- Suggest actual **safe over-the-counter medicines** for minor conditions
- If multiple options exist, suggest the **best 1-2 medicines** with basic dosage guidance
- Avoid giving exact mg dosages unless very common
- Always mention "consult doctor if symptoms persist or worsen"
- Include contraindications (e.g., "Don't take if you have liver problems")

🛡️ SYMPTOM HANDLING PRIORITY:
- When users describe symptoms, focus on providing helpful medical advice
- Do NOT ask for medicine creation details unless specifically requested
- Provide immediate relief suggestions and when to seek professional help
- Be empathetic and understanding of their concerns

🌍 MULTILINGUAL SUPPORT:
- Understand Hinglish (Hindi-English mixed)
- Respond in user's preferred language
- Use culturally appropriate examples
- Be sensitive to cultural health practices

Use simple, professional, and caring language. Your role is to act like a real medicine advisor while prioritizing safety.
        `,
    };

    let messages = [systemMessage];

    if (Array.isArray(input)) {
      // Input is a conversation history array: [{ role, message|content }]
      const history = input.map((m) => {
        const role = m.role === "bot" ? "assistant" : (m.role || "user");
        const content = m.message ?? m.content ?? "";
        return { role, content };
      });
      messages = [systemMessage, ...history];
    } else if (typeof input === "string") {
      messages = [
        systemMessage,
        { role: "user", content: input },
      ];
    } else {
      throw new Error("getHealthGPTResponse expects a string or an array of messages.");
    }

    console.log("Health GPT Messages:", JSON.stringify(messages, null, 2));

    const response = await openai.chat.completions.create({
      model: options.model || "gpt-4",
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.max_tokens ?? 900,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");

    const result = response.choices?.[0]?.message?.content?.trim() || "";
    console.log("Health GPT Final Reply:", result);

    // 🛡️ Safety check for response content
    const safetyCheck = checkResponseSafety(result);
    if (safetyCheck.isUnsafe) {
      console.log("🚨 UNSAFE RESPONSE DETECTED:", {
        content: result,
        matchedPattern: safetyCheck.matchedPattern,
        timestamp: new Date().toISOString()
      });
      
      // Return safe fallback response
      return "I cannot provide that type of information. I'm designed to help with health-related questions and medical advice. How else can I assist you with your health needs?";
    }

    return result;
  } catch (error) {
    console.error(
      "Health GPT Error (Full):",
      error.response?.data || error.message
    );
    throw new Error("Failed to generate Health GPT response.");
  }
};

const VALID_INTENTS = [
  "create_medicine_schedule",
  "create_vaccine_schedule",
  "check_medicine_schedule",
  "check_vaccine_schedule",
  "create_vaccine",
  "create_medicine",
  "create_supplement",
  "general_query",
  "generate_health_score",
];

const responseSchema = z.object({
  intent: z.enum(VALID_INTENTS),
});

export const detectMainIntentWithOpenAI = async (input) => {
  // 🚨 SUPER-EARLY DETECTION for common confusing cases
  const inputLower = typeof input === 'string' ? input.toLowerCase() : '';
  
  // 🛡️ IMPROVED: Check for symptom-based queries FIRST to avoid false triggers
  const symptomPatterns = [
    /\b(am having|having|feeling|feel|experiencing|experience|suffering from|suffering)\b/i,
    /\b(pain|ache|hurt|hurts|sore|tired|weak|dizzy|nausea|fever|cough|cold|headache|stomach|back|chest|throat)\b/i,
    /\b(symptoms|symptom|problem|problems|issue|issues|condition|conditions)\b/i,
    /\b(not feeling well|don't feel well|feel sick|feeling sick|unwell|ill)\b/i,
    /\b(advice|help|what should i do|what to do|suggestions|recommendations)\b/i
  ];
  
  const isSymptomQuery = symptomPatterns.some(pattern => pattern.test(inputLower));
  
  if (isSymptomQuery) {
    console.log("🚨 SUPER-EARLY: Detected symptom query, routing to general_query");
    return { intent: "general_query" };
  }
  
  // Check for medicine scheduling intent (most common confusion)
  if (/\b(create|make|set\s*up|add)\b.*\b(medicine|medication|meds)\b.*\b(schedule|scheduale|schedualing|sedaule|daily|routine|reminder|reminders|when|timing|frequency|dose\s*time|dose\s*times)\b/i.test(inputLower)) {
    console.log("🚨 SUPER-EARLY: Detected medicine scheduling intent");
    return { intent: "create_medicine_schedule" };
  }
  
  // Check for medicine creation intent
  if (/\b(create|make|add|register|store)\b.*\b(medicine|medication|meds)\b/i.test(inputLower) && 
      !/\b(schedule|scheduale|schedualing|sedaule|daily|routine|reminder|reminders|when|timing|frequency|dose\s*time|dose\s*times)\b/i.test(inputLower)) {
    console.log("🚨 SUPER-EARLY: Detected medicine creation intent");
    return { intent: "create_medicine" };
  }
  
  // Check for supplement creation intent
  if (/\b(create|make|add|register)\b.*\b(supplement|vitamin|omega|fish\s*oil)\b/i.test(inputLower)) {
    console.log("🚨 SUPER-EARLY: Detected supplement creation intent");
    return { intent: "create_supplement" };
  }
  
  // Check for vaccine scheduling intent
  if (/\b(create|make|set\s*up|add)\b.*\b(vaccine|vaccination)\b.*\b(schedule|scheduale|schedualing|sedaule|appointment|date|time)\b/i.test(inputLower)) {
    console.log("🚨 SUPER-EARLY: Detected vaccine scheduling intent");
    return { intent: "create_vaccine_schedule" };
  }
  
  // Check for vaccine creation intent
  if (/\b(create|make|add|register)\b.*\b(vaccine|vaccination)\b/i.test(inputLower) && 
      !/\b(schedule|scheduale|schedualing|appointment|date|time)\b/i.test(inputLower)) {
    console.log("🚨 SUPER-EARLY: Detected vaccine creation intent");
    return { intent: "create_vaccine" };
  }

  const SYSTEM_PROMPT = `You are HealthBot, an intelligent medical assistant. Classify the user's intent into **one of the following categories only**.

CRITICAL: You must respond with ONLY valid JSON. No explanations, no extra text, no markdown, no formatting.

1. create_medicine_schedule — User wants to create/set up a medicine schedule with timing/frequency.
2. create_vaccine_schedule — User wants to schedule a vaccine (date/time).
3. check_medicine_schedule — User wants to check upcoming/present medicine timings.
4. check_vaccine_schedule — User wants to check upcoming vaccine appointments.
5. create_vaccine — User wants to add a new vaccine to the system (NOT for scheduling).
6. create_medicine — User wants to add/register a new medicine to the system (NOT for scheduling).
7. create_supplement — User wants to add/register a new supplement (NOT for scheduling).
8. general_query — ANYTHING ELSE including symptoms, medical advice, health questions, lifestyle queries, or general health information.
9. generate_health_score — User wants a health score based on bot questions.

🛡️ CRITICAL PRIORITY: If the user is describing symptoms, pain, discomfort, or seeking medical advice, ALWAYS classify as "general_query" regardless of any other keywords present.

**CRITICAL DISTINCTIONS - READ CAREFULLY:**

**MEDICINE SCHEDULING vs MEDICINE CREATION:**
- **create_medicine_schedule**: User wants to set up WHEN to take existing medicines (timing, frequency, reminders, daily schedule)
- **create_medicine**: User wants to add a NEW medicine to the system (creation, registration, storage, adding to list)

**KEY WORDS TO IDENTIFY INTENT:**
- **SCHEDULING WORDS** → create_medicine_schedule:
  * "schedule", "scheduale", "schedualing", "daily schedule", "when to take"
  * "reminders", "reminder", "alerts", "notifications"
  * "dose time", "dose times", "timing", "frequency"
  * "every X hours", "twice daily", "morning and evening"
  * "add to schedule", "set up schedule", "create schedule"

- **CREATION WORDS** → create_medicine:
  * "create", "add", "register", "store", "prepare", "make"
  * "new medicine", "new medication", "add medicine to list"
  * "medicine name", "dosage", "quantity", "price"
  * "manufacturer", "brand", "expiry date"

**EXAMPLES - MEDICINE SCHEDULING (create_medicine_schedule):**
- "please create a medicine scheduale for me" → create_medicine_schedule
- "I need to schedule my medicine" → create_medicine_schedule
- "Set up reminders for my medicine" → create_medicine_schedule
- "When should I take my medicine?" → create_medicine_schedule
- "Create a daily schedule for my medicine" → create_medicine_schedule
- "Add medicine to my daily routine" → create_medicine_schedule
- "Set up medicine reminders" → create_medicine_schedule

**EXAMPLES - MEDICINE CREATION (create_medicine):**
- "Create a new medicine" → create_medicine
- "Add medicine to my list" → create_medicine
- "Register this medicine" → create_medicine
- "Store medicine information" → create_medicine
- "I want to add a medicine" → create_medicine

**EXAMPLES - SUPPLEMENT CREATION (create_supplement):**
- "Create a supplement" → create_supplement
- "Add vitamin supplement" → create_supplement
- "Register supplement" → create_supplement

**EXAMPLES - SYMPTOMS & MEDICAL ADVICE (general_query):**
- "I am having headache and neck pain" → general_query
- "I am having stomach pain after eating" → general_query
- "I am feeling dizzy and weak" → general_query
- "I have a fever and cough" → general_query
- "What should I do for back pain?" → general_query
- "I'm not feeling well" → general_query
- "Help me with my symptoms" → general_query

**FOLLOW-UP RESPONSES:**
- If user says "name is [something]", "500mg", "yes", "no" → classify based on previous context
- If previous context was about scheduling → create_medicine_schedule
- If previous context was about creation → create_medicine or create_supplement

**CRITICAL: You must respond with ONLY this exact JSON format, no other text:**
{"intent": "one of the above intents"}`;

  const fallbackIntent = { intent: "general_query" };

  try {
    let messages = [{ role: "system", content: SYSTEM_PROMPT }];
    if (Array.isArray(input)) {
      const history = input.map((m) => ({
        role: m.role === "bot" ? "assistant" : m.role,
        content: m.message ?? m.content ?? "",
      }));
      messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
    } else {
      messages.push({ role: "user", content: input });
    }

    const res = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0,
      max_tokens: 100,
      messages,
    });

    const raw = res.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallbackIntent;

    console.log("Raw main intent response:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON parse error in main intent:", parseError);
      console.error("Raw response:", raw);
      
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (extractError) {
          console.error("Failed to extract JSON from main intent:", extractError);
          // Enhanced fallback logic for vaccine schedule context
          return handleVaccineScheduleFallback(input, fallbackIntent);
        }
      } else {
        // Enhanced fallback logic for vaccine schedule context
        return handleVaccineScheduleFallback(input, fallbackIntent);
      }
    }

    const validated = responseSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }

    // Soft fallback
    const fallbackMatch = raw.match(/"intent"\s*:\s*"([^"]+)"/i);
    const intent = fallbackMatch?.[1];
    if (VALID_INTENTS.includes(intent)) {
      return { intent };
    }

    return fallbackIntent;
  } catch (err) {
    console.error("Failed to detect main intent:", err);
    
    // 🛡️ CRITICAL: Provide better fallback based on input content
    if (typeof input === 'string') {
      const inputLower = input.toLowerCase();
      
      // Fallback pattern matching for common cases
      if (/\b(create|make|add)\b.*\b(vaccine|vaccination)\b/i.test(inputLower)) {
        return { intent: "create_vaccine" };
      }
      if (/\b(create|make|add)\b.*\b(medicine|medication|meds)\b/i.test(inputLower)) {
        return { intent: "create_medicine" };
      }
      if (/\b(create|make|add)\b.*\b(supplement|vitamin)\b/i.test(inputLower)) {
        return { intent: "create_supplement" };
      }
      if (/\b(schedule|scheduale|schedualing)\b.*\b(medicine|medication|meds)\b/i.test(inputLower)) {
        return { intent: "create_medicine_schedule" };
      }
      if (/\b(schedule|scheduale|schedualing)\b.*\b(vaccine|vaccination)\b/i.test(inputLower)) {
        return { intent: "create_vaccine_schedule" };
      }
    }
    
    return fallbackIntent;
  }
};

// Enhanced fallback function for vaccine schedule context
export const handleVaccineScheduleFallback = (input, fallbackIntent) => {
  console.log("🔍 Using enhanced fallback logic for vaccine schedule context");
  
  if (typeof input === 'string') {
    const inputLower = input.toLowerCase();
    
    // Check if we're in vaccine schedule creation context
    if (/\b(vaccination\s+)?date\b/i.test(inputLower) || 
        /\b(july|august|september|october|november|december|january|february|march|april|may|june)\b/i.test(inputLower) ||
        /\b(202[4-9]|20[3-9][0-9])\b/.test(inputLower)) {
      
      console.log("🔍 Detected vaccine schedule date context, returning create_vaccine_schedule intent");
      return { intent: "create_vaccine_schedule" };
    }
    
    // Check for other vaccine-related patterns
    if (/\b(vaccine|vaccination)\b/i.test(inputLower)) {
      console.log("🔍 Detected vaccine context, returning create_vaccine_schedule intent");
      return { intent: "create_vaccine_schedule" };
    }
  }
  
  console.log("🔍 No specific vaccine context detected, using default fallback");
  return fallbackIntent;
};

export const verifyMedicineDetailsWithOpenAI = async ({
  medicineName,
  dosage,
  description,
  takenForSymptoms,
  associatedRisks,
  // Optional Phase-2 fields
  usage,
  sideEffects,
  warnings,
  contraindications,
  storageInstructions,
  pregnancySafe,
  pediatricUse,
  adverseReactions,
}) => {
  // Build dynamic prompt based on provided fields
  let promptFields = `
    You are a medical expert. Verify if the following medicine details seem realistic, medically valid, and correct:
    
    REQUIRED FIELDS:
    Medicine Name: ${medicineName}
    Dosage: ${dosage}
    Description: ${description}
    Taken For Symptoms: ${takenForSymptoms}
    Associated Risks: ${associatedRisks}
  `;

  // Add optional fields only if they are provided
  const optionalFields = [];

  if (usage) {
    optionalFields.push(`Usage: ${usage}`);
  }

  if (sideEffects && Array.isArray(sideEffects) && sideEffects.length > 0) {
    optionalFields.push(`Side Effects: ${sideEffects.join(', ')}`);
  }

  if (warnings && Array.isArray(warnings) && warnings.length > 0) {
    optionalFields.push(`Warnings: ${warnings.join(', ')}`);
  }

  if (contraindications && Array.isArray(contraindications) && contraindications.length > 0) {
    optionalFields.push(`Contraindications: ${contraindications.join(', ')}`);
  }

  if (storageInstructions) {
    optionalFields.push(`Storage Instructions: ${storageInstructions}`);
  }

  if (pregnancySafe !== undefined && pregnancySafe !== null) {
    optionalFields.push(`Pregnancy Safe: ${pregnancySafe}`);
  }

  if (pediatricUse !== undefined && pediatricUse !== null) {
    optionalFields.push(`Pediatric Use: ${pediatricUse}`);
  }

  if (adverseReactions && Array.isArray(adverseReactions) && adverseReactions.length > 0) {
    optionalFields.push(`Adverse Reactions: ${adverseReactions.join(', ')}`);
  }

  if (optionalFields.length > 0) {
    promptFields += `\n\nOPTIONAL FIELDS:\n${optionalFields.join('\n')}`;
  }

  const fullPrompt = `${promptFields}

    VERIFICATION INSTRUCTIONS:
    - Check if the medicine name is realistic and properly formatted
    - Verify if the dosage information is medically appropriate
    - Ensure description is coherent and medically relevant
    - Validate that symptoms and risks are realistic
    - For optional fields provided, verify they are medically accurate and appropriate
    
    Respond only with:
    - "VALID" if everything seems realistic, correct, and medically appropriate.
    - "INVALID" if any information looks wrong, fake, not medically appropriate, or contains obvious errors.
  `;

  try {
    // Request OpenAI to verify the details
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: fullPrompt }],
    });

    console.log({ gptResponse });

    const verificationResult = gptResponse.choices[0].message.content.trim();
    console.log({ verificationResult });

    if (verificationResult !== "VALID") {
      return {
        isValid: false,
        message:
          "Medicine details seem invalid. Please correct the information.",
      };
    }

    return { isValid: true, message: "Medicine details are valid." };
  } catch (error) {
    console.error("OpenAI Verification Error:", error);
    throw new Error("Error verifying medicine details with OpenAI.");
  }
};

export const detectScheduleIntentWithOpenAI = async (inputText) => {
  const today = new Date().toISOString().split("T")[0];

  const SYSTEM_PROMPT = `You are HealthBot, a smart and precise medical assistant. Today's date is ${today}.

CRITICAL: This function is ONLY for checking existing medicine schedules, NOT for creating new schedules.

You only handle **medicine schedules** (vaccination not included for now).

You must respond with ONLY valid JSON. No explanations, no extra text.

Your task:
- Understand if the user is asking about:
  1. Medicine schedule for a date (today, tomorrow, or specific date)
  2. Dose status (e.g., how many doses taken, remaining)
  3. Or if it's a general medical question

Response Instructions:
- If user is asking about a medicine schedule for a date, respond:
{"action": "check_schedule", "date": "YYYY-MM-DD"}

- If user is asking about taken or pending doses, respond:
{"action": "dose_status", "date": "YYYY-MM-DD"}

- If it's something else unrelated to schedule/doses, respond:
{"action": "general_query"}

**CRITICAL: You must respond with ONLY this exact JSON format, no other text:**
{"action": "action_type", "date": "YYYY-MM-DD"}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0.7,
      max_tokens: 100,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: inputText },
      ],
    });

    const raw = response.choices[0].message.content.trim();

    try {
      const json = JSON.parse(raw);
      console.log("Schedule Intent Detected:", json);
      return json;
    } catch (err) {
      console.error("Failed to parse schedule intent JSON:", raw);
      console.error("Parse error:", err);
      
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log("Extracted schedule intent:", extracted);
          return extracted;
        } catch (extractError) {
          console.error("Failed to extract JSON from schedule intent:", extractError);
          return { action: "general_query" };
        }
      }
      
      return { action: "general_query" };
    }
  } catch (error) {
    console.error("Error in detectScheduleIntentWithOpenAI:", error);
    throw new Error("Failed to detect schedule intent.");
  }
};

export const detectMedicineIntentWithOpenAI = async (inputText) => {
  const today = new Date().toISOString().split("T")[0];

  const SYSTEM_PROMPT = `You are HealthBot, a smart and precise medical assistant. Today's date is ${today}.

CRITICAL: This function is ONLY for checking existing medicine information, NOT for creating new medicines or schedules.

You only handle **medicine information-related queries** from the user's supplement list.

You must respond with ONLY valid JSON. No explanations, no extra text.

Your job:
Detect if the user is asking about:
1. A specific field related to a medicine (e.g., dosage, quantity, risks, expiry, etc.)
2. A quantity check like "Is any medicine less than 30 in quantity?"
3. A request to list all medicines
4. Or if it's a general health-related question

Response Format:
- If user is asking about a specific field of a medicine:
{"action": "medicine_info", "medicineName": "Levothyroxine", "type": "dosage"}

- If user is asking whether any medicine quantity is below a threshold:
{"action": "quantity_check", "threshold": 30}

- If user is asking to list all medicines:
{"action": "list_medicines"}

- If it's something general or unrelated to medicines:
{"action": "general_query"}

Examples:
Input: "What is Levothyroxine used for?"
Output: {"action": "medicine_info", "medicineName": "Levothyroxine", "type": "symptoms"}

Input: "How many tablets of Omeprazole do I have left?"
Output: {"action": "medicine_info", "medicineName": "Omeprazole", "type": "quantity"}

Input: "Is the quantity of any medicine less than 30?"
Output: {"action": "quantity_check", "threshold": 30}

Input: "List all my medicines"
Output: {"action": "list_medicines"}

**CRITICAL: You must respond with ONLY this exact JSON format, no other text:**
{"action": "action_type", "medicineName": "name", "type": "field_type", "threshold": number}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0.3,
      max_tokens: 100,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: inputText },
      ],
    });

    const raw = response.choices[0].message.content.trim();

    try {
      const json = JSON.parse(raw);
      console.log("Medicine Intent Detected:", json);
      return json;
    } catch (err) {
      console.error("Failed to parse medicine intent JSON:", raw);
      console.error("Parse error:", err);
      
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log("Extracted medicine intent:", extracted);
          return extracted;
        } catch (extractError) {
          console.error("Failed to extract JSON from medicine intent:", extractError);
          return { action: "general_query" };
        }
      }
      
      return { action: "general_query" };
    }
  } catch (error) {
    console.error("Error in detectMedicineIntentWithOpenAI:", error);
    throw new Error("Failed to detect medicine intent.");
  }
};

export const detectVaccineIntentWithOpenAI = async (inputText) => {
  const today = new Date().toISOString().split("T")[0];

  const SYSTEM_PROMPT = `You are HealthBot, a smart assistant that handles only vaccination schedules. Today's date is ${today}.

CRITICAL: This function is ONLY for checking existing vaccine schedules, NOT for creating new schedules.

You must respond with ONLY valid JSON. No explanations, no extra text.

Understand if the user is asking for:
1. Vaccination schedule for a date (today, tomorrow, or a specific date)

Return format:
{"action": "check_vaccine_schedule", "date": "YYYY-MM-DD"}

If it's not a vaccine-related query, return:
{"action": "not_vaccine_query"}

**CRITICAL: You must respond with ONLY this exact JSON format, no other text:**
{"action": "action_type", "date": "YYYY-MM-DD"}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0.3,
      max_tokens: 100,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: inputText },
      ],
    });

    const raw = response.choices[0].message.content.trim();

    try {
      const json = JSON.parse(raw);
      console.log("Vaccine Intent Detected:", json);
      return json;
    } catch (err) {
      console.error("Failed to parse vaccine intent JSON:", raw);
      console.error("Parse error:", err);
      
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log("Extracted vaccine intent:", extracted);
          return extracted;
        } catch (extractError) {
          console.error("Failed to extract JSON from vaccine intent:", extractError);
          return { action: "not_vaccine_query" };
        }
      }
      
      return { action: "not_vaccine_query" };
    }
  } catch (error) {
    console.error("Error in detectVaccineIntentWithOpenAI:", error);
    throw new Error("Failed to detect vaccine intent.");
  }
};

export const normalizeUserInput = async (rawInput) => {
  const SYSTEM_PROMPT = `
You are a powerful conversational assistant that helps rephrase user input into clear, natural, human-like English while preserving the original meaning.

Instructions:
- Understand the user's intent even if the message is short, broken, or written in mixed Hindi-English.
- Fix grammar, spelling, and structure, but do not change the message's meaning.
- NEVER fabricate, assume, or add content.
- If the input is already clear and short (e.g., "yes", "two", "create a vaccine"), keep it as is.
- If the input is vague or incomplete (e.g., "ok", "hmm", "idk"), return the input unchanged.

Return ONLY the improved message — no explanation, no markdown.
`;

  const skipNormalization = (text) => {
    const safeInputs = [
      "yes",
      "no",
      "ok",
      "cancel",
      "stop",
      "exit",
      "continue",
      "start",
      "restart",
      "1",
      "2",
      "3",
      "4",
      "one",
      "two",
      "three",
      "four",
      "create a vaccine",
      "health score",
    ];
    return safeInputs.includes(text.trim().toLowerCase());
  };

  try {
    if (skipNormalization(rawInput)) {
      return rawInput.trim();
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: rawInput },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error in normalizeUserInput:", error);
    return rawInput; // fallback to raw input
  }
};

export const detectCreateMedicineScheduleIntentWithOpenAI = async (
  messageHistory = [],
  collected = {}
) => {
  const today = new Date().toISOString().split("T")[0];

  const SYSTEM_PROMPT = `You are HealthBot, a caring assistant helping users schedule their medicine.

CRITICAL: This function is ONLY for scheduling WHEN to take existing medicines, NOT for creating new medicines.

IMPORTANT: You MUST respond ONLY in valid JSON format. No other text allowed.

Today's date is: ${today}

**VALIDATION RULES (MUST FOLLOW):**
- quantity: MUST be a whole number (1, 2, 3, 10, 20) - NO decimals (3.5, 6.8, 15.7)
- startDate: MUST be today or in the future, NEVER in the past
- endDate: MUST be today or in the future, NEVER in the past
- doseTimes: MUST be future times from now, NEVER past times

**PAST DATE DETECTION (CRITICAL):**
- Current year is 2025
- ANY date with year < 2025 (e.g., 2004, 2020, 2023) MUST be rejected
- ANY relative past reference (yesterday, last week, last month) MUST be rejected
- ONLY accept: today, tomorrow, next week, next month, or future YYYY-MM-DD

**REJECTION EXAMPLES:**
- User says "quantity is 3.5" → REJECT, ask for whole number
- User says "quantity is 6.8" → REJECT, ask for whole number
- User says "start date is yesterday" → REJECT, ask for today or future
- User says "dose time is 2 AM" (if it's past 2 AM) → REJECT, ask for future time

Collect the following fields in this order:
- medicineName (e.g., "Vitamin C", "Paracetamol")
- quantity (number, e.g., 5, 10, 20) - WHOLE NUMBERS ONLY, NO DECIMALS
- startDate (e.g., "tomorrow", "next Monday", or "YYYY-MM-DD") - FUTURE DATES ONLY
- endDate (same format as above) - FUTURE DATES ONLY
- doseTimes (["9:00 AM", "9:00 PM"]) - FUTURE TIMES ONLY
- totalDosesPerDay (1, 2, etc.)

**EXAMPLES:**
User: "medicine name is Vitamin C" → {"collected": {"medicineName": "Vitamin C"}, "nextStep": "quantity", "ask": "Great! How many doses/tablets do you want to schedule? (e.g., 5, 10, 20) - Must be a whole number, no decimals like 3.5 or 6.8"}
User: "quantity is 10" → {"collected": {"quantity": 10}, "nextStep": "startDate", "ask": "When do you want to start taking this medicine? (e.g., tomorrow, next Monday, or YYYY-MM-DD) - Must be today or a future date"}
User: "quantity is 3.5" → {"collected": {}, "nextStep": "quantity", "ask": "⚠️ Quantity must be a whole number (no decimals like 3.5, 6.8). Please provide a whole number like 3, 4, or 5."}
User: "start date is tomorrow" → {"collected": {"startDate": "tomorrow"}, "nextStep": "endDate", "ask": "When do you want to stop taking this medicine? (e.g., next week, or YYYY-MM-DD) - Must be today or a future date"}
User: "start date is 22 june 2004" → {"collected": {}, "nextStep": "startDate", "ask": "⚠️ Start date cannot be in the past (2004 is in the past). Please provide today's date or a future date like tomorrow, next week, or YYYY-MM-DD."}
User: "end date is next Friday" → {"collected": {"endDate": "next Friday"}, "nextStep": "doseTimes", "ask": "What times do you want to take this medicine? (e.g., ['9:00 AM', '6:00 PM']) - Must be future times from now"}
User: "end date is 23 june 2004" → {"collected": {}, "nextStep": "endDate", "ask": "⚠️ End date cannot be in the past (2004 is in the past). Please provide today's date or a future date like next week, next month, or YYYY-MM-DD."}
User: "dose times are 9 AM and 6 PM" → {"collected": {"doseTimes": ["9:00 AM", "6:00 PM"]}, "nextStep": "totalDosesPerDay", "ask": "How many total doses per day? (e.g., 2)"}
User: "total doses per day is 2" → {"collected": {"totalDosesPerDay": 2}, "nextStep": "done", "ask": "Perfect! All required fields collected. Creating your medicine schedule..."}

**COMPREHENSIVE CREATION:**
If user provides multiple fields in one message like:
"create a medicine schedule for Vitamin C, quantity: 15, start date: tomorrow, end date: next Friday, dose times: 9 AM and 6 PM, total doses per day: 2"

Then extract all fields and set nextStep to "done".

**IMPORTANT: Even in comprehensive creation, validate each field:**
- If quantity is decimal (3.5, 6.8), reject and ask for whole number
- If dates are in past, reject and ask for valid dates
- If times are in past, reject and ask for future times

Already collected:
${JSON.stringify(collected, null, 2)}

Conversation:
$${Array.isArray(messageHistory)
      ? messageHistory.map((m) => `${m.role.toUpperCase()}: ${m.message}`).join("\n")
      : ""}

Rules:
- If user switches topic (e.g., talks about symptoms), return:
  {
    "collected": {},
    "nextStep": "exit",
    "ask": "I notice you're asking about something different. Would you like to:\n• Continue creating your medicine schedule\n• Cancel and start over\n• Ask a different health question\n\nJust let me know what you'd prefer!"
  }

- NEVER allow past dates for startDate or endDate.
- NEVER allow decimal numbers for quantity (3.5, 6.8, etc.) - ONLY whole numbers
- NEVER allow past times for doseTimes
- If totalDosesPerDay = 2 but only 1 doseTime given, ask for remaining time.
- If all fields are valid, return nextStep = "done".
- If user provides decimal quantity, immediately reject and ask for whole number.

**CRITICAL PAST DATE VALIDATION:**
- If user mentions any year before current year (e.g., 2004, 2020, 2023) → REJECT with validation message
- If user mentions "yesterday", "last week", "last month", "past" → REJECT with validation message
- If user mentions specific past dates like "22 june 2004" → REJECT with validation message
- Only accept: "today", "tomorrow", "next week", "next month", or future YYYY-MM-DD
- Current year is 2025, so any date with year < 2025 should be rejected

Respond ONLY in this format:
{
  "collected": {
    "medicineName": "optional string",
    "quantity": optional number,
    "startDate": "optional YYYY-MM-DD",
    "endDate": "optional YYYY-MM-DD",
    "doseTimes": ["optional times"],
    "totalDosesPerDay": optional number
  },
  "nextStep": "medicineName | quantity | startDate | endDate | doseTimes | totalDosesPerDay | done | exit",
  "ask": "friendly message"
}`;

  try {
    const formattedMessages = [
      {
        role: "system",
        content: [{ type: "text", text: SYSTEM_PROMPT }],
      },
      ...((Array.isArray(messageHistory) ? messageHistory : []).map((msg) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: [{ type: "text", text: msg.message }],
      }))),
    ];

    // const response = await openai.chat.completions.create({
    //   model: "gpt-4",
    //   messages: formattedMessages,
    //   temperature: 0.1, // Lower temperature for more consistent JSON output
    //   max_tokens: 800,
    //   response_format: { type: "json_object" }, // Force JSON response format
    // });

    const response = await openai.chat.completions.create({
      model: MODEL,                            // ← minimal change (optional)
      messages: formattedMessages,
      temperature: 0.1,
      max_tokens: 800,
      ...(supportsJsonMode(MODEL)              // ← ✅ only if supported
         ? { response_format: { type: "json_object" } }
         : {})
    });
    

    let raw = response.choices?.[0]?.message?.content?.trim();
    console.log("GPT Raw Response (medicine):", raw);

    let parsed;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        parsed = JSON.parse(raw);
        break; // Successfully parsed, exit loop
      } catch (parseErr) {
        console.error(`Failed to parse JSON (attempt ${retryCount + 1}):`, raw);
        
        if (retryCount === maxRetries) {
          // Final attempt failed, try to extract useful information
          console.log("Attempting to extract information from malformed response...");
          
          // Try to find medicine name in the response
          const medicineMatch = raw.match(/(?:medicine|medicine name|medication).*?[:=]\s*["']?([^"'\n,]+)["']?/i);
          const quantityMatch = raw.match(/(?:quantity|doses?|tablets?).*?[:=]\s*(\d+)/i);
          const dateMatch = raw.match(/(?:date|start|end).*?[:=]\s*([^\n,]+)/i);
          const timeMatch = raw.match(/(?:time|dose|schedule).*?[:=]\s*([^\n,]+)/i);
          
          if (medicineMatch || quantityMatch || dateMatch || timeMatch) {
            // Try to construct a partial response
            const partialCollected = { ...collected };
            
            if (medicineMatch && !partialCollected.medicineName) {
              partialCollected.medicineName = medicineMatch[1].trim();
            }
            if (quantityMatch && !partialCollected.quantity) {
              partialCollected.quantity = parseInt(quantityMatch[1]);
            }
            
            // Determine next step based on what's missing
            const missingFields = [];
            if (!partialCollected.medicineName) missingFields.push("medicineName");
            if (!partialCollected.quantity) missingFields.push("quantity");
            if (!partialCollected.startDate) missingFields.push("startDate");
            if (!partialCollected.endDate) missingFields.push("endDate");
            if (!partialCollected.doseTimes) missingFields.push("doseTimes");
            if (!partialCollected.totalDosesPerDay) missingFields.push("totalDosesPerDay");
            
            const nextStep = missingFields[0] || "done";
            const ask = `I understood some information but need clarification. Please provide: ${missingFields.join(", ")}`;
            
            return {
              collected: partialCollected,
              nextStep,
              ask
            };
          }
          
          // If no useful information could be extracted
          return {
            collected,
            nextStep: "error",
            ask: "I'm having trouble understanding. Could you please provide the information step by step? Start with the medicine name.",
          };
        }
        
        // Retry with a more specific prompt
        retryCount++;
        const retryPrompt = `The previous response was not in valid JSON format. Please respond ONLY with valid JSON in this exact format:
{
  "collected": {
    "medicineName": "string or null",
    "quantity": "number or null", 
    "startDate": "string or null",
    "endDate": "string or null",
    "doseTimes": ["array of times or empty"],
    "totalDosesPerDay": "number or null"
  },
  "nextStep": "string",
  "ask": "string"
}`;
        
        // const retryResponse = await openai.chat.completions.create({
        //   model: "gpt-4",
        //   messages: [
        //     { role: "system", content: retryPrompt },
        //     { role: "user", content: `Please fix this response: ${raw}` }
        //   ],
        //   temperature: 0.1,
        //   max_tokens: 300,
        //   response_format: { type: "json_object" }, // Force JSON response format
        // });

        const retryResponse = await openai.chat.completions.create({
          model: MODEL,                            // ← minimal change (optional)
          messages: [
            { role: "system", content: retryPrompt },
            { role: "user", content: `Please fix this response: ${raw}` }
          ],
          temperature: 0.1,
          max_tokens: 300,
          ...(supportsJsonMode(MODEL)              // ← ✅ only if supported
             ? { response_format: { type: "json_object" } }
             : {})
        });
        
        
        raw = retryResponse.choices?.[0]?.message?.content?.trim();
        console.log(`Retry response (attempt ${retryCount}):`, raw);
      }
    }

    const normalizeDate = (input) => {
      const parsedDate = chrono.parseDate(input, { timezone: "Asia/Kolkata" });
      if (!parsedDate) return null;
      const iso = parsedDate.toISOString().split("T")[0];
      return iso >= today ? iso : null;
    };

    // 🛡️ Validate quantity - must be whole number, no decimals
    if (parsed.collected?.quantity !== undefined && parsed.collected.quantity !== null) {
      console.log("🔍 Validating quantity:", parsed.collected.quantity, "Type:", typeof parsed.collected.quantity);
      
      // Additional check: ensure it's actually a number
      if (typeof parsed.collected.quantity !== 'number' || isNaN(parsed.collected.quantity)) {
        console.log("❌ Invalid quantity type:", parsed.collected.quantity);
        parsed.nextStep = "quantity";
        parsed.ask = "⚠️ Quantity must be a valid number. Please provide a whole number.";
        return parsed;
      }
      
      // Check if it's a decimal number
      if (parsed.collected.quantity % 1 !== 0) {
        console.log("❌ Decimal quantity detected:", parsed.collected.quantity);
        parsed.nextStep = "quantity";
        parsed.ask = "⚠️ Quantity must be a whole number (no decimals like 3.5, 6.8). Please provide a whole number.";
        return parsed;
      }
      
      // Check if it's positive
      if (parsed.collected.quantity <= 0) {
        console.log("❌ Invalid quantity (<= 0):", parsed.collected.quantity);
        parsed.nextStep = "quantity";
        parsed.ask = "⚠️ Quantity must be greater than 0. Please provide a valid quantity.";
        return parsed;
      }
      
      console.log("✅ Quantity validation passed:", parsed.collected.quantity);
    }

    if (parsed.collected?.startDate) {
      const validStart = normalizeDate(parsed.collected.startDate);
      if (validStart) {
        parsed.collected.startDate = validStart;
      } else {
        parsed.nextStep = "startDate";
        parsed.ask = "⚠️ That date is in the past. Please provide a valid start date.";
      }
    }

    if (parsed.collected?.endDate) {
      const validEnd = normalizeDate(parsed.collected.endDate);
      if (validEnd) {
        parsed.collected.endDate = validEnd;
      } else {
        parsed.nextStep = "endDate";
        parsed.ask = "⚠️ That end date is in the past. Please provide a valid one.";
      }
    }

    // 🛡️ Validate dose times - must be future times
    if (parsed.collected?.doseTimes && Array.isArray(parsed.collected.doseTimes)) {
      console.log("🔍 GPT: Validating dose times:", parsed.collected.doseTimes);
      console.log("🔍 GPT: Start date for context:", parsed.collected.startDate);
      
      // 🛡️ SMART VALIDATION: Only validate past times if start date is today
      let shouldValidatePastTime = false;
      
      if (parsed.collected.startDate) {
        const startDate = new Date(parsed.collected.startDate);
        const today = new Date();
        
        // Check if start date is today (same day)
        if (startDate.getDate() === today.getDate() && 
            startDate.getMonth() === today.getMonth() && 
            startDate.getFullYear() === today.getFullYear()) {
          shouldValidatePastTime = true;
          console.log("🔍 GPT: Start date is today - will validate past times");
        } else if (startDate > today) {
          shouldValidatePastTime = false;
          console.log("🔍 GPT: Start date is in future - no past time validation needed");
        } else {
          shouldValidatePastTime = true;
          console.log("🔍 GPT: Start date is in past - will validate past times");
        }
      } else {
        // No start date provided, use current time for validation
        shouldValidatePastTime = true;
        console.log("🔍 GPT: No start date provided - using current time for validation");
      }
      
      if (shouldValidatePastTime) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        console.log("🔍 GPT: Validating against current time:", currentTime);
        
        for (let i = 0; i < parsed.collected.doseTimes.length; i++) {
          const timeStr = parsed.collected.doseTimes[i];
          console.log(`🔍 GPT: Validating dose time ${i + 1}:`, timeStr);
          
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
            console.log(`❌ GPT: Past dose time detected: ${timeStr} (${timeInMinutes} minutes vs current ${currentTime} minutes)`);
            
            // 🛡️ SMART VALIDATION MESSAGE: Explain the context
            let errorMessage;
            if (parsed.collected.startDate) {
              const startDate = new Date(parsed.collected.startDate);
              const today = new Date();
              if (startDate.getDate() === today.getDate() && 
                  startDate.getMonth() === today.getMonth() && 
                  startDate.getFullYear() === today.getFullYear()) {
                errorMessage = `⚠️ Dose time "${timeStr}" is in the past for today. Please provide a future time since your schedule starts today.`;
              } else {
                errorMessage = `⚠️ Dose time "${timeStr}" is in the past. Please provide future times only.`;
              }
            } else {
              errorMessage = `⚠️ Dose time "${timeStr}" is in the past. Please provide future times only.`;
            }
            
            parsed.nextStep = "doseTimes";
            parsed.ask = errorMessage;
            console.log("🔍 GPT: Sending validation message:", errorMessage);
            return parsed;
          }
          console.log(`✅ GPT: Dose time validation passed:`, timeStr);
        }
        console.log("✅ GPT: All dose times validation passed");
      } else {
        console.log("✅ GPT: Skipping past time validation - start date is in future");
      }
    }

    if (
      parsed.collected?.totalDosesPerDay &&
      parsed.collected?.doseTimes &&
      parsed.collected.doseTimes.length < parsed.collected.totalDosesPerDay
    ) {
      const remaining = parsed.collected.totalDosesPerDay - parsed.collected.doseTimes.length;
      parsed.nextStep = "doseTimes";
              parsed.ask = `You've provided ${parsed.collected.doseTimes.length} time(s), but you said you take ${parsed.collected.totalDosesPerDay} doses per day. Please provide ${remaining} more time(s).`;
    }

    const requiredFields = ["medicineName", "quantity", "startDate", "endDate", "doseTimes", "totalDosesPerDay"];
    const stillMissing = requiredFields.filter((f) => !parsed.collected?.[f]);

    if (stillMissing.length >= 1 && parsed.nextStep !== "exit") {
      const humanReadable = stillMissing.map((f) =>
        f === "medicineName"
          ? "medicine name"
          : f === "quantity"
            ? "quantity"
            : f === "startDate"
              ? "start date"
              : f === "endDate"
                ? "end date"
                : f === "doseTimes"
                  ? "dose times"
                  : f === "totalDosesPerDay"
                    ? "total doses per day"
                    : f
      );

      parsed.nextStep = stillMissing[0];
              parsed.ask = `Please provide the following to create your medicine schedule: ${humanReadable.join(", ")}.`;
    }

    return parsed;
  } catch (error) {
    console.error("Error in detectCreateMedicineScheduleIntentWithOpenAI:", error);
    return {
      collected,
      nextStep: "error",
      ask: "Sorry, I didn't understand that. Can you rephrase?",
    };
  }
};

export const detectCreateVaccineScheduleIntentWithOpenAI = async (
  messageHistory = [],
  collected = {}
) => {
  const today = new Date().toISOString().split("T")[0];
  const safeHistory = Array.isArray(messageHistory) ? messageHistory : [];

  const SYSTEM_PROMPT = `You are HealthBot, a kind and helpful assistant that helps users schedule vaccinations.

CRITICAL: This function is ONLY for scheduling WHEN to get vaccinated, NOT for creating new vaccine records.

Today's date is ${today}

Your job is to collect these 3 fields to complete a vaccine schedule:
1. vaccineName (e.g., "Hepatitis B", "Covid-19")
2. date (can be natural language like "tomorrow", "June 21", "in 3 days")
3. doseTime (e.g., "10:30 AM", "2 PM")

VALIDATION RULES (CRITICAL):
- DATE: Must be today or a future date (not in the past)
- TIME: If the vaccine schedule date is today, the dose time must be a future time (not in the past). If the vaccine schedule date is in the future, any time is allowed.

REJECTION EXAMPLES:
- Past dates like "22 June 2004", "yesterday", "last week" should be rejected
- If date is today and time is "7:00 AM" but current time is 8:00 AM, reject the time
- If date is "30 June 2026" (future) and time is "7:00 AM", accept any time

Already collected:
${JSON.stringify(collected, null, 2)}

Recent conversation:
${Array.isArray(messageHistory)
      ? messageHistory.map((m) => `${m.role.toUpperCase()}: ${m.message}`).join("\n")
      : ""
    }

🧠 Instructions:
- If the user is not talking about vaccine scheduling, return:
{
  "collected": {},
  "nextStep": "exit",
  "ask": "I notice you're asking about something different. Would you like to:\n• Continue creating your vaccine schedule\n• Cancel and start over\n• Ask a different health question\n\nJust let me know what you'd prefer!"
}

- If more than one required field is missing, ask for them together in one sentence.
- If all 3 fields are filled, set nextStep = "done".
- If the date is in the past, return:
{
  "collected": { "vaccineName": "...", "doseTime": "..." },
  "nextStep": "date",
  "ask": "⚠️ The date you mentioned is in the past. Please provide a valid future date for your vaccine schedule."
}

- If the date is today and the time is in the past, return:
{
  "collected": { "vaccineName": "...", "date": "..." },
  "nextStep": "doseTime",
  "ask": "⚠️ The time you mentioned is in the past for today. Please provide a future time since your vaccine is scheduled for today."
}

✅ Output format (strictly JSON):
{
  "collected": {
    "vaccineName": "optional string",
    "date": "optional string",
    "doseTime": "optional string"
  },
  "nextStep": "vaccineName | date | doseTime | done | exit",
  "ask": "Your next message to the user"
}`;

  try {
    const formattedMessages = [
      {
        role: "system",
        content: [{ type: "text", text: SYSTEM_PROMPT }],
      },
      ...safeHistory.map((msg) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: [{ type: "text", text: msg.message }],
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: formattedMessages,
      temperature: 0.4,
      max_tokens: 600,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();

    try {
      const parsed = JSON.parse(raw);

      // 🛡️ SMART VALIDATION: Date and Time validation
      if (parsed.collected?.date) {
        const isoDate = normalizeDate(parsed.collected.date);
        if (isoDate) {
          const userDate = new Date(isoDate);
          const now = new Date();
          now.setHours(0, 0, 0, 0);

          if (userDate < now) {
            console.log(`❌ GPT: Past date detected: ${parsed.collected.date} (${isoDate})`);
            return {
              collected: {
                ...parsed.collected,
                date: undefined,
              },
              nextStep: "date",
              ask: "⚠️ The date you gave seems to be in the past. Can you please give a valid future date for the vaccine schedule?",
            };
          }

          parsed.collected.date = isoDate;
          console.log(`✅ GPT: Date validation passed: ${isoDate}`);
        }
      }

      // 🛡️ SMART VALIDATION: Dose Time validation
      if (parsed.collected?.doseTime && parsed.collected?.date) {
        console.log("🔍 GPT: Validating dose time:", parsed.collected.doseTime);
        console.log("🔍 GPT: Date for context:", parsed.collected.date);

        // 🛡️ SMART VALIDATION: Only validate past times if date is today
        let shouldValidatePastTime = false;

        const scheduleDate = new Date(parsed.collected.date);
        const today = new Date();

        // Check if schedule date is today (same day)
        if (scheduleDate.getDate() === today.getDate() &&
            scheduleDate.getMonth() === today.getMonth() &&
            scheduleDate.getFullYear() === today.getFullYear()) {
          shouldValidatePastTime = true;
          console.log("🔍 GPT: Schedule date is today - will validate past times");
        } else if (scheduleDate > today) {
          shouldValidatePastTime = false;
          console.log("🔍 GPT: Schedule date is in future - no past time validation needed");
        } else {
          shouldValidatePastTime = true;
          console.log("🔍 GPT: Schedule date is in past - will validate past times");
        }

        if (shouldValidatePastTime) {
          const now = new Date();
          const currentTime = now.getHours() * 60 + now.getMinutes();
          console.log("🔍 GPT: Validating against current time:", currentTime);

          const timeStr = parsed.collected.doseTime;
          console.log(`🔍 GPT: Validating dose time:`, timeStr);

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
            console.log(`❌ GPT: Past dose time detected: ${timeStr} (${timeInMinutes} minutes vs current ${currentTime} minutes)`);

            // 🛡️ SMART VALIDATION MESSAGE: Explain the context
            let errorMessage;
            if (parsed.collected.date) {
              const scheduleDate = new Date(parsed.collected.date);
              const today = new Date();
              if (scheduleDate.getDate() === today.getDate() &&
                  scheduleDate.getMonth() === today.getMonth() &&
                  scheduleDate.getFullYear() === today.getFullYear()) {
                errorMessage = `⚠️ Dose time "${timeStr}" is in the past for today. Please provide a future time since your vaccine is scheduled for today.`;
              } else {
                errorMessage = `⚠️ Dose time "${timeStr}" is in the past. Please provide future times only.`;
              }
            } else {
              errorMessage = `⚠️ Dose time "${timeStr}" is in the past. Please provide future times only.`;
            }

            parsed.nextStep = "doseTime";
            parsed.ask = errorMessage;
            console.log("🔍 GPT: Sending validation message:", errorMessage);
            return parsed;
          }
          console.log(`✅ GPT: Dose time validation passed:`, timeStr);
        } else {
          console.log("✅ GPT: Skipping past time validation - schedule date is in future");
        }
      }

      // Batching for missing required fields
      const requiredFields = ["vaccineName", "date", "doseTime"];
      const stillMissing = requiredFields.filter((f) => !parsed.collected?.[f]);

      if (stillMissing.length >= 1 && parsed.nextStep !== "exit") {
        const humanReadable = stillMissing.map((f) =>
          f === "vaccineName"
            ? "vaccine name"
            : f === "date"
              ? "vaccination date"
              : f === "doseTime"
                ? "vaccination time"
                : f
        );

        parsed.nextStep = stillMissing[0];
        parsed.ask = `Please provide the following details to schedule the vaccine: ${humanReadable.join(", ")}.`;
      }

      console.log("Vaccine Schedule Intent:", parsed);
      return parsed;
    } catch (err) {
      console.error("Failed to parse vaccine schedule JSON:", raw);
      
      // 🛡️ ENHANCED ERROR HANDLING: Never let the bot stop
      if (raw && typeof raw === 'string') {
        const lowerRaw = raw.toLowerCase();
        
        // Check if it's a vaccine-related message
        if (/\b(vaccine|vaccination|flu\s+shot|corona|covid|schedule|seduale)\b/i.test(lowerRaw)) {
          console.log("🔍 Detected vaccine-related content, providing helpful response");
          return {
            collected,
            nextStep: "vaccineName",
            ask: "I understand you want to schedule a vaccine. Please provide the vaccine name first.",
          };
        }
        
        // Check if it's a date/time message
        if (/\b(date|time|monday|tuesday|wednesday|thursday|friday|saturday|sunday|june|july|august|202[4-9])\b/i.test(lowerRaw)) {
          console.log("🔍 Detected date/time content, asking for vaccine name");
          return {
            collected,
            nextStep: "vaccineName",
            ask: "I see you mentioned a date or time. To schedule your vaccine, I need the vaccine name first. What vaccine would you like to schedule?",
          };
        }
        
        // Check if it's a general creation message
        if (/\b(create|make|add|new)\b/i.test(lowerRaw)) {
          console.log("🔍 Detected creation intent, starting fresh");
          return {
            collected: {},
            nextStep: "vaccineName",
            ask: "Great! Let's create a new vaccine schedule. Please provide the vaccine name first.",
          };
        }
      }
      
      // 🛡️ ULTIMATE FALLBACK: Always keep the conversation going
      console.log("🔍 Using ultimate fallback to keep conversation alive");
      return {
        collected,
        nextStep: "vaccineName",
        ask: "I'm here to help you schedule a vaccine. Please provide the vaccine name first.",
      };
    }
  } catch (error) {
    console.error("Error in detectCreateVaccineScheduleIntentWithOpenAI:", error);
    
    // 🛡️ NEVER THROW ERROR: Always return a helpful response
    console.log("🔍 Critical error occurred, but bot will continue working");
    
    return {
      collected: {},
      nextStep: "vaccineName",
      ask: "I'm here to help you schedule a vaccine. Let's start fresh. Please provide the vaccine name first.",
    };
  }
};

export const detectCreateVaccineIntentWithOpenAI = async (
  messageHistory = [],
  collected = {}
) => {
  const safeHistory = Array.isArray(messageHistory) ? messageHistory : [];

  const SYSTEM_PROMPT = `You are HealthBot, helping users add new vaccines to their health records.

CRITICAL: This function is ONLY for creating NEW vaccine records, NOT for scheduling vaccinations.

You must collect:
- vaccineName (required): e.g., "Covid-19"
- provider (required): e.g., "Pfizer", "Merck"
- description (optional): Only include if user provides it

IMPORTANT: If the user provides comprehensive vaccine details (like dosage, price, quantity, brand, manufacturer, expiration, age group), this indicates they want to create a detailed vaccine record that should be handled by the comprehensive system.

Already collected:
${JSON.stringify(collected, null, 2)}

Full chat history:
${
  safeHistory.map((m) => `${m.role}: ${m.message}`).join("\n")
}

Instructions:
- If the user provides comprehensive vaccine details (dosage, price, quantity, brand, manufacturer, expiration, age group), set nextStep = "comprehensive" to route to the detailed system.
- If the user starts discussing a different topic (e.g. symptoms, diseases, pain, fever, supplement-related terms), assume context switch.
- In that case, return:
  {
    "collected": {},
    "nextStep": "exit",
    "ask": "It looks like you're talking about something else. Should I cancel vaccine creation?"
  }

- If both required fields are missing, ask for both together.
  Example: "Please share the name of the vaccine and the provider."
- If only one required field is missing, ask for that one clearly.
- If only optional field is missing, ask optionally.
- If all required fields are present, set nextStep = "done".

ONLY respond with valid JSON like:
{
  "collected": {
    "vaccineName": "...",
    "provider": "...",
    "description": "..."
  },
  "nextStep": "vaccineName | provider | description | done | exit | comprehensive",
  "ask": "your message to the user"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...safeHistory.map((m) => ({
          role: m.role === "bot" ? "assistant" : m.role,
          content: m.message,
        })),
      ],
      temperature: 0.4,
      max_tokens: 600,
    });

    const raw = response.choices[0].message.content.trim();
    if (!raw.startsWith("{")) throw new Error("Not a JSON response");

    const parsed = JSON.parse(raw);
    console.log("Vaccine Create Intent:", parsed);

    // Check if user provided comprehensive details
    const lastUserMessage = safeHistory.filter(m => m.role === "user").pop()?.message || "";
    const hasComprehensiveDetails = /(dosage|price|quantity|brand|manufacturer|expiration|exp|age\s*group)/i.test(lastUserMessage);
    
    if (hasComprehensiveDetails && parsed.nextStep !== "exit") {
      parsed.nextStep = "comprehensive";
      parsed.ask = "I can see you've provided comprehensive vaccine details. Let me create a detailed vaccine record for you using our advanced system.";
    }

    // Force batching if vaccineName or provider are missing
    const requiredFields = ["vaccineName", "provider"];
    const stillMissing = requiredFields.filter((f) => !parsed.collected?.[f]);

    if (stillMissing.length >= 1 && parsed.nextStep !== "exit" && parsed.nextStep !== "comprehensive") {
      const humanReadable = stillMissing.map((f) =>
        f === "vaccineName"
          ? "vaccine name"
          : f === "provider"
            ? "provider name"
            : f
      );

      parsed.nextStep = stillMissing[0];
      parsed.ask = `Please provide the following info to continue: ${humanReadable.join(", ")}.`;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to parse vaccine creation intent:", error);
    return {
      collected: {},
      nextStep: "exit",
      ask: "It looks like you're talking about something else. Should I cancel vaccine creation?",
    };
  }
};

export const detectCreateMedicineIntentWithOpenAI = async (
  messageHistory = [],
  collected = {}
) => {
  const today = new Date().toISOString().split("T")[0];
  
  const SYSTEM_PROMPT = `You are HealthBot, helping users create a new medicine entry.

CRITICAL: You must respond with ONLY valid JSON. No explanations, no extra text, no markdown, no formatting.

**IMPORTANT: This function is ONLY for creating NEW medicines, NOT for scheduling when to take them.**

**DATE VALIDATION RULES:**
- Today's date is: ${today}
- mfgDate: Must be today or in the past (can be "today", "2025-06-21", "yesterday", "last week")
- expDate: Must be AFTER today (future dates only, e.g., "in 1 year", "2026-01-01", "next year May")
- NEVER allow expDate to be today or in the past

Required fields:
- medicineName (string)
- dosage (e.g., "500mg")
- price (number)
- quantity (number)
- singlePack (string, e.g., "10 tablets", "30 capsules")
- mfgDate (e.g., "today", "2025-06-21", "yesterday", "last week")
- expDate (e.g., "in 1 year", "2026-01-01", "next year May", "tomorrow")

Optional:
- description
- takenForSymptoms (this can also be called "purpose" - e.g., "heart health and brain function")
- associatedRisks

**SPECIAL HANDLING FOR RESPONSES:**
- If user says "name is [something]" → extract medicineName = "[something]"
- If user says "[dosage]mg" or "[number] tablets" → extract dosage = "[dosage]mg" or "[number] tablets"
- If user says "purpose is [something]" → extract takenForSymptoms = "[something]"
- If user says "price is [amount]" → extract price = [amount]
- If user says "quantity is [number]" → extract quantity = [number]

**EXAMPLES:**
User: "name is dolo" → {"collected": {"medicineName": "dolo"}, "nextStep": "dosage", "ask": "Great! What's the dosage? (e.g., 500mg, 2 tablets)"}
User: "500mg" → {"collected": {"dosage": "500mg"}, "nextStep": "price", "ask": "What's the price? (Must be whole number, no decimals like 3.5, 8.9)"}
User: "price is 30" → {"collected": {"price": 30}, "nextStep": "quantity", "ask": "What's the quantity? (Must be whole number, no decimals like 3.5, 8.9)"}
User: "quantity is 10" → {"collected": {"quantity": 10}, "nextStep": "singlePack", "ask": "What's the package details? (e.g., 10 tablets, 30 capsules)"}
User: "single pack is 10 tablets" → {"collected": {"singlePack": "10 tablets"}, "nextStep": "mfgDate", "ask": "What's the manufacturing date? (Can be today or past date, e.g., 'today', '2024-08-01', 'yesterday')"}
User: "mfg date is today" → {"collected": {"mfgDate": "today"}, "nextStep": "expDate", "ask": "What's the expiry date? (Must be a future date, e.g., '2026-10-01', 'in 1 year', 'next year May')"}
User: "exp date is 2026-10-01" → {"collected": {"expDate": "2026-10-01"}, "nextStep": "done", "ask": "Perfect! All required fields collected. Creating your medicine..."}

**COMPREHENSIVE CREATION:**
If user provides multiple fields in one message like:
"create a medicine with name: Paracetamol, dosage: 500mg, price: 30, quantity: 10, singlePack: 10 tablets, mfgDate: today, expDate: 2026-10-01"

Then extract all fields and set nextStep to "done".

**CRITICAL: You must respond with ONLY this exact JSON format, no other text:**
{"collected": {"fieldName": "value"}, "nextStep": "next_field_name" | "done" | "exit", "ask": "Question to ask user"}`;

  const fallbackResponse = {
    collected: {},
    nextStep: "medicineName",
    ask: "Please provide the medicine name, dosage, price, quantity, single pack details, manufacturing date (YYYY-MM-DD), and expiry date (YYYY-MM-DD). You can send multiple together.",
  };

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messageHistory.map((m) => ({
        role: m.role === "bot" ? "assistant" : m.role,
        content: m.message ?? m.content ?? "",
      })),
    ];

    const res = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0,
      max_tokens: 500,
      messages,
    });

    const raw = res.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallbackResponse;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (extractError) {
          return fallbackResponse;
        }
      } else {
        return fallbackResponse;
      }
    }

    const mergedCollected = { ...collected, ...parsed.collected };
    const requiredFields = ["medicineName", "dosage", "price", "quantity", "singlePack", "mfgDate", "expDate"];
    const stillMissing = requiredFields.filter((field) => !mergedCollected?.[field]);

    // Only apply default values when the flow is complete
    if (parsed.nextStep === "done" || stillMissing.length === 0) {
      if (!mergedCollected.singlePack) {
        mergedCollected.singlePack = "1 pack";
      }
      
      if (!mergedCollected.mfgDate) {
        const today = new Date().toISOString().split('T')[0];
        mergedCollected.mfgDate = today;
      }
      
      if (!mergedCollected.expDate) {
        const twoYearsFromNow = new Date();
        twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
        mergedCollected.expDate = twoYearsFromNow.toISOString().split('T')[0];
      }
    }

    if (stillMissing.length === 0) {
      parsed.nextStep = "done";
    }

    // Generate dynamic ask message based on missing fields
    let finalAsk = parsed.ask || fallbackResponse.ask;
    if (stillMissing.length > 0) {
      const missingFieldsText = stillMissing.map(field => {
        switch(field) {
          case 'medicineName': return 'medicine name';
          case 'dosage': return 'dosage';
          case 'price': return 'price (whole number only, no decimals)';
          case 'quantity': return 'quantity (whole number only, no decimals)';
          case 'singlePack': return 'single pack details';
          case 'mfgDate': return 'manufacturing date (YYYY-MM-DD, cannot be future)';
          case 'expDate': return 'expiry date (YYYY-MM-DD, must be future date)';
          default: return field;
        }
      }).join(', ');
      finalAsk = `Please provide: ${missingFieldsText}`;
    }

    return {
      collected: mergedCollected,
      nextStep: parsed.nextStep || fallbackResponse.nextStep,
      ask: finalAsk,
    };
  } catch (err) {
    console.error("Failed to detect medicine intent:", err);
    return fallbackResponse;
    }
};

export const detectCreateSupplementIntentWithOpenAI = async (
  messageHistory = [],
  collected = {}
) => {
  const SYSTEM_PROMPT = `You are HealthBot, helping users create a new supplement (medicine) entry.

CRITICAL: You must respond with ONLY valid JSON. No explanations, no extra text, no markdown, no formatting.

**IMPORTANT: This function is ONLY for creating NEW supplements/medicines, NOT for scheduling when to take them.**

**REQUIRED FIELDS (ALL MUST BE COLLECTED):**
- medicineName (string) - Name of the medicine
- dosage (e.g., "500mg", "2 tablets") - Dosage information
- price (number) - Price of the medicine (MUST be whole number, no decimals like 3.5, 8.9)
- quantity (number) - Quantity available (MUST be whole number, no decimals like 3.5, 8.9)
- singlePack (string) - Package details like "10 tablets", "30 capsules"
- mfgDate (string) - Manufacturing date in YYYY-MM-DD format (cannot be future date)
- expDate (string) - Expiry date in YYYY-MM-DD format (MUST be future date, not past)

**VALIDATION RULES:**
- price: Only whole numbers (1, 2, 3, 10, 50, 100) - NO decimals (3.5, 8.9, 15.7)
- quantity: Only whole numbers (1, 2, 3, 10, 50, 100) - NO decimals (3.5, 8.9, 15.7)
- mfgDate: Cannot be in the future, must be today or past date
- expDate: Cannot be in the past, must be future date from today

**OPTIONAL FIELDS:**
- description (string) - Description of the medicine
- takenForSymptoms (string) - Purpose/symptoms it's for
- associatedRisks (string) - Any associated risks

**SPECIAL HANDLING FOR RESPONSES:**
- If user says "name is [something]" → extract medicineName = "[something]"
- If user says "[dosage]mg" or "[number] tablets" → extract dosage = "[dosage]mg" or "[number] tablets"
- If user says "purpose is [something]" → extract takenForSymptoms = "[something]"
- If user says "price is [amount]" → extract price = [amount]
- If user says "quantity is [number]" → extract quantity = [number]

**IMPORTANT: Simple responses like "medicine", "yes", "ok", "supplement" should NOT be treated as comprehensive input. These are just confirmations that the user wants to create medicine, not actual medicine details.**

**EXAMPLES:**
User: "name is dolo" → {"collected": {"medicineName": "dolo"}, "nextStep": "dosage", "ask": "Great! What's the dosage? (e.g., 500mg, 2 tablets)"}
User: "500mg" → {"collected": {"dosage": "500mg"}, "nextStep": "price", "ask": "What's the price? (Must be whole number, no decimals like 3.5, 8.9)"}
User: "price is 30" → {"collected": {"price": 30}, "nextStep": "quantity", "ask": "What's the quantity? (Must be whole number, no decimals like 3.5, 8.9)"}
User: "quantity is 10" → {"collected": {"quantity": 10}, "nextStep": "singlePack", "ask": "What's the package details? (e.g., 10 tablets, 30 capsules)"}
User: "single pack is 10 tablets" → {"collected": {"singlePack": "10 tablets"}, "nextStep": "mfgDate", "ask": "What's the manufacturing date? (YYYY-MM-DD format)"}
User: "mfg date is 2024-08-01" → {"collected": {"mfgDate": "2024-08-01"}, "nextStep": "expDate", "ask": "What's the expiry date? (YYYY-MM-DD format)"}
User: "exp date is 2026-10-01" → {"collected": {"expDate": "2026-10-01"}, "nextStep": "done", "ask": "Perfect! All required fields collected. Creating your medicine..."}
User: "medicine" → {"collected": {}, "nextStep": "medicineName", "ask": "Great! What's the name of your medicine?"}
User: "yes" → {"collected": {}, "nextStep": "medicineName", "ask": "Great! What's the name of your medicine?"}

**COMPREHENSIVE CREATION:**
If user provides multiple fields in one message like:
"create a medicine with name: Paracetamol, dosage: 500mg, price: 30, quantity: 10, singlePack: 10 tablets, mfgDate: 2024-08-01, expDate: 2026-10-01"

Then extract all fields and set nextStep to "done".

**CRITICAL: You must respond with ONLY this exact JSON format, no other text:**
{"collected": {"fieldName": "value"}, "nextStep": "next_field_name" | "done" | "exit", "ask": "Question to ask user"}`;

  const fallbackResponse = {
    collected: {},
    nextStep: "medicineName",
    ask: "Please provide the medicine name, dosage, price, quantity, single pack details, manufacturing date (YYYY-MM-DD), and expiry date (YYYY-MM-DD). You can send multiple together.",
  };

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messageHistory.map((m) => ({
        role: m.role === "bot" ? "assistant" : m.role,
        content: m.message ?? m.content ?? "",
      })),
    ];

    const res = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0,
      max_tokens: 500,
      messages,
    });

    const raw = res.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallbackResponse;

    console.log("Raw OpenAI response:", raw);

    let parsed;
    try {
      // Try to parse the raw response
      parsed = JSON.parse(raw);
      console.log("Parsed supplement intent:", parsed);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw response that failed to parse:", raw);
      
      // Try to extract JSON from the response if it contains extra text
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
          console.log("Extracted JSON from response:", parsed);
        } catch (extractError) {
          console.error("Failed to extract JSON:", extractError);
          return fallbackResponse;
        }
      } else {
        return fallbackResponse;
      }
    }

    // Check if this is a simple confirmation response that shouldn't extract fields
    const lastUserMessage = messageHistory[messageHistory.length - 1]?.content || "";
    const simpleConfirmations = ["medicine", "supplement", "yes", "ok", "okay", "sure", "fine", "good"];
    
    if (simpleConfirmations.includes(lastUserMessage.toLowerCase().trim())) {
      console.log("Simple confirmation detected, not extracting fields");
      return {
        collected: {},
        nextStep: "medicineName",
        ask: "Great! Let's start with the medicine name. I'll need: name, dosage, price, quantity, singlePack, mfgDate, and expDate.",
      };
    }

    // Merge with existing collected data
    const mergedCollected = { ...collected, ...parsed.collected };

    // ✅ Required fields (ALL 7 fields must be collected)
    const requiredFields = [
      "medicineName",
      "dosage",
      "price",
      "quantity",
      "singlePack",
      "mfgDate",
      "expDate",
    ];

    const stillMissing = requiredFields.filter(
      (field) => !mergedCollected?.[field]
    );

    // Only apply default values when the flow is complete
    if (parsed.nextStep === "done" || stillMissing.length === 0) {
      if (!mergedCollected.singlePack) {
        mergedCollected.singlePack = "1 pack"; // Default package info
      }
      
      if (!mergedCollected.mfgDate) {
        // Set manufacture date to today if not provided
        const today = new Date().toISOString().split('T')[0];
        mergedCollected.mfgDate = today;
      }
      
      if (!mergedCollected.expDate) {
        // Set expiry date to 2 years from today if not provided
        const twoYearsFromNow = new Date();
        twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
        mergedCollected.expDate = twoYearsFromNow.toISOString().split('T')[0];
      }
    }

    // If all required fields are present, mark as done
    if (stillMissing.length === 0) {
      parsed.nextStep = "done";
    }

    // Generate dynamic ask message based on missing fields
    let finalAsk = parsed.ask || fallbackResponse.ask;
    if (stillMissing.length > 0) {
      const missingFieldsText = stillMissing.map(field => {
        switch(field) {
          case 'medicineName': return 'medicine name';
          case 'dosage': return 'dosage';
          case 'price': return 'price (whole number only, no decimals)';
          case 'quantity': return 'quantity (whole number only, no decimals)';
          case 'singlePack': return 'single pack details';
          case 'mfgDate': return 'manufacturing date (YYYY-MM-DD, cannot be future)';
          case 'expDate': return 'expiry date (YYYY-MM-DD, must be future date)';
          default: return field;
        }
      }).join(', ');
      finalAsk = `Please provide: ${missingFieldsText}`;
    }

    return {
      collected: mergedCollected,
      nextStep: parsed.nextStep || fallbackResponse.nextStep,
      ask: finalAsk,
    };
  } catch (err) {
    console.error("Failed to detect supplement intent:", err);
    return fallbackResponse;
  }
};

export const detectCreateHealthRecordIntentWithOpenAI = async (
  inputText,
  collected = {},
  previousScore = null
) => {
  let answers = { ...collected };
  let answeredCount = Object.keys(answers).length;

  const normalizeInput = (input = "") => {
    const cleaned = input.trim().toLowerCase();
    if (/^(one|1|ek|१|१\.|١)$/i.test(cleaned)) return "1";
    if (/^(two|2|do|२|٢)$/i.test(cleaned)) return "2";
    if (/^(three|3|teen|३|٣)$/i.test(cleaned)) return "3";
    if (/^(four|4|char|चार|٤)$/i.test(cleaned)) return "4";
    return null;
  };

  const normalizedInput = normalizeInput(inputText);

  if (normalizedInput && answeredCount < 10) {
    answers[answeredCount + 1] = normalizedInput;
    answeredCount = Object.keys(answers).length;
  }

  const SYSTEM_PROMPT = `
You are HealthBot, an intelligent and empathetic health assessment AI assistant.

Instructions:
- Ask users 10 unique health-related multiple-choice questions (MCQs), one at a time.
- Use 10 distinct domains: activity, sleep, diet, hydration, mental health, stress, screen time, social life, posture, preventive care.
- Each must have exactly 4 options (1 to 4), with no domain repetition.
- Use a friendly, motivational tone.
- Accept answers in multiple languages and formats (e.g., "1", "one", "तीन", "FOUR").

Scoring:
- 1 = 2.5 pts
- 2 = 5 pts
- 3 = 7.5 pts
- 4 = 10 pts

Final Report:
- Once all 10 responses are collected:
  1. Sum the score.
  2. Compare with previousScore (if provided).
  3. Output JSON only:
  {
    "score": "<string>",
    "previousScore": "<string>",
    "message": "<score change summary + status (Low/Medium/High) + health tips>"
  }

IMPORTANT:
If the user changes topic (e.g., "how do I cancel supplement?"), respond ONLY with:
{
  "nextStep": "exit",
  "ask": "It seems like you've changed the topic. Should I stop the health assessment?"
}

Response Rules:
- If less than 10 answers → return ONLY next question string.
- If 10 answers → return ONLY JSON as described above.
- NEVER explain format. Never return markdown.
`.trim();

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          answeredCount === 10
            ? `Here are my answers: ${JSON.stringify(answers)}${previousScore
              ? ` and my previous score was ${previousScore}`
              : ""
            }`
            : inputText,
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      temperature: 0.5,
      max_tokens: 800,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    console.log("Raw GPT Response:", raw);

    // If GPT returned structured JSON
    if (raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.nextStep === "exit") {
          return parsed;
        }

        if (answeredCount === 10) {
          return {
            score: parsed.score.toString(),
            previousScore: parsed.previousScore || previousScore || null,
            message:
              parsed.message || "Your health score has been calculated.",
          };
        }
      } catch (e) {
        console.error("JSON Parse Error:", e);
        return {
          score: "0",
          message: "Sorry, something went wrong. Please try again.",
        };
      }
    }

    // GPT returned a plain next question
    if (answeredCount < 10) {
      return {
        questionNumber: answeredCount + 1,
        question: raw,
        answers,
      };
    }

    // Fallback
    return {
      score: "0",
      message: "⚠️ Something went wrong. Please try again.",
    };
  } catch (error) {
    console.error("detectCreateHealthRecordIntentWithOpenAI error:", error);
    return {
      score: "0",
      message:
        "Sorry, I couldn't process your request. Please try again later.",
    };
  }
};
