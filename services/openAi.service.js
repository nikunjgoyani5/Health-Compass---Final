import config from "../config/config.js";
import OpenAI from "openai";

const OpenAIClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * NOTE: Please don't change this function.
 */

// export async function aiRankAndExplain({ userGoals, candidates }) {
//   if (!config.openAiApiKey) {
//     return {
//       tag: "Smart Suggestion",
//       insight: null,
//       aiTopId: null,
//       usedAI: false,
//       confidence: null,
//     };
//   }

//   try {
//     const { OpenAI } = await import("openai");
//     const client = new OpenAI({ apiKey: config.openAiApiKey });

//     const lines = candidates
//       .map(
//         (c, i) =>
//           `${i + 1}. id=${c._id}; name=${c.productName}; claims=[${(
//             c.claims || []
//           ).join(", ")}]; desc=${c.description || ""}`
//       )
//       .join("\n");

//     const prompt = `User goals: ${JSON.stringify(userGoals)}

// Supplements:
// ${lines}

// Task:
// 1) Pick ONE best supplement for these goals (bestId MUST be one of the exact 'id=' above).
// 2) Return a short "insight" (one sentence).
// 3) Return "confidence" (integer 0-100) = how strongly you'd recommend this for these goals.
// Calibrate confidence:
// - 70–100: High (strong alignment with multiple goals)
// - 40–69:  Medium (some alignment or partial fit)
// - 0–39:   Low (weak/generic fit)
// Avoid 100 unless extremely strong.

// Respond STRICT JSON:
// {"bestId":"<id>", "insight":"<one sentence>", "confidence": 0..100}`;

//     const req = {
//       model: "gpt-4o-mini",
//       messages: [
//         {
//           role: "system",
//           content: "You are a precise ranking engine. Output strict JSON only.",
//         },
//         { role: "user", content: prompt },
//       ],
//       temperature: 0.1,
//       // response_format: { type: "json_object" }, // if your SDK supports it, uncomment
//     };

//     const completion = await client.chat.completions.create(req);
//     const raw = completion.choices?.[0]?.message?.content || "{}";

//     // tolerant parse
//     let parsed = {};
//     try {
//       parsed = JSON.parse(raw);
//     } catch {
//       const m = /"bestId"\s*:\s*"([^"]+)"/i.exec(raw);
//       const n = /"insight"\s*:\s*"([^"]*)"/i.exec(raw);
//       const c = /"confidence"\s*:\s*([0-9]+)/i.exec(raw);
//       parsed = {
//         bestId: m?.[1],
//         insight: n?.[1] || null,
//         confidence: c ? Number(c[1]) : null,
//       };
//     }

//     let bestId = parsed?.bestId || null;
//     let insight = parsed?.insight || null;
//     let aiConfidence = Number.isFinite(parsed?.confidence)
//       ? parsed.confidence
//       : null;

//     // Fallbacks: index or name to id
//     if (
//       bestId &&
//       !String(bestId).includes("-") &&
//       /^[0-9]+$/.test(String(bestId))
//     ) {
//       const idx = Number(bestId) - 1;
//       if (idx >= 0 && idx < candidates.length)
//         bestId = String(candidates[idx]._id);
//     } else if (
//       bestId &&
//       !candidates.some((c) => String(c._id) === String(bestId))
//     ) {
//       const byName = candidates.find(
//         (c) =>
//           String(c.productName).toLowerCase() === String(bestId).toLowerCase()
//       );
//       if (byName) bestId = String(byName._id);
//     }

//     // clamp confidence 0..100 (or null if invalid)
//     if (Number.isFinite(aiConfidence)) {
//       if (aiConfidence < 0) aiConfidence = 0;
//       if (aiConfidence > 100) aiConfidence = 100;
//     } else {
//       aiConfidence = null;
//     }

//     return {
//       tag: "AI Selected",
//       insight,
//       aiTopId: bestId,
//       usedAI: true,
//       confidence: aiConfidence,
//     };
//   } catch (err) {
//     console.error("OpenAI error:", err?.message);
//     return {
//       tag: "Smart Suggestion",
//       insight: null,
//       aiTopId: null,
//       usedAI: false,
//       confidence: null,
//     };
//   }
// }

export async function aiRankAndExplain({
  userGoals,
  candidates,
  userContextPrompt,
}) {
  if (!candidates || candidates.length === 0) {
    return {
      tag: "Smart Suggestion",
      insight: null,
      aiTopId: null,
      usedAI: false,
      confidence: null,
    };
  }

  const best = candidates[0];

  // Instead of a plain sentence, build a contextual AI-style reason
  const insight =
    `Based on your profile:\n${userContextPrompt}\n\n` +
    (userGoals.length
      ? `This supplement best matches your goals: ${userGoals.join(", ")}.`
      : `This supplement is the strongest overall fit for your health profile.`);

  return {
    tag: "AI Selected",
    insight,
    aiTopId: String(best._id),
    usedAI: true,
    confidence: 70, // or computed dynamically
  };
}

export function ruleConfidence(score0to100, matchedGoalsCount) {
  let conf = Math.round(score0to100 ?? 0);

  // Minimum bands by how many goals match (health-goal aware fallback)
  if (matchedGoalsCount >= 3) conf = Math.max(conf, 75);
  else if (matchedGoalsCount === 2) conf = Math.max(conf, 60);
  else if (matchedGoalsCount === 1) conf = Math.max(conf, 45);

  // business floor/ceiling
  conf = Math.max(15, Math.min(conf, 100));
  return conf;
}

// Get AI interaction
export async function getAIInteraction(a, b) {
  console.log("Starting AI interaction check...");

  const prompt = `
    You are a medical assistant. 
    Given two items:
    - ${a.name} (${a.type})
    - ${b.name} (${b.type})

    1. Determine if there is a potential interaction.
    2. Classify severity as Minor, Moderate, or Severe.
    3. Write a short explanation of the interaction.
    4. Write a disclaimer message in 1 sentence.

    Return a JSON object like this:
    {
      "severity": "...",
      "explanation": "...",
      "disclaimer": "..."
    }
  `;

  console.log("Sending request to OpenAI:\n", {
    model: "gpt-4o-mini",
    temperature: 0.2,
    promptLength: prompt.length,
    itemPair: `${a.name} + ${b.name}`,
  });

  try {
    const response = await OpenAIClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    console.log("Received response from OpenAI:\n", {
      model: response.model,
      usage: response.usage,
      finishReason: response.choices[0]?.finish_reason,
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });

    // Parse AI response
    try {
      const text = response.choices[0].message.content;
      console.log("Raw AI response:\n", {
        responseText:
          text?.substring(0, 200) + (text?.length > 200 ? "..." : ""),
        fullLength: text?.length || 0,
      });

      // Clean the response text to extract JSON
      let cleanedText = text.trim();
      
      // Remove markdown code blocks if present
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to find JSON object in the text
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      console.log("Cleaned AI response:\n", {
        cleanedText: cleanedText.substring(0, 200) + (cleanedText.length > 200 ? "..." : ""),
        fullLength: cleanedText.length,
      });

      const parsedResponse = JSON.parse(cleanedText);

      console.log("Successfully parsed AI response:\n", {
        severity: parsedResponse.severity,
        explanationLength: parsedResponse.explanation?.length || 0,
        disclaimerLength: parsedResponse.disclaimer?.length || 0,
        hasAllRequiredFields: !!(
          parsedResponse.severity &&
          parsedResponse.explanation &&
          parsedResponse.disclaimer
        ),
      });

      return parsedResponse;
    } catch (parseErr) {
      console.error("JSON parse error:\n", {
        error: parseErr.message,
        itemPair: `${a.name} + ${b.name}`,
      });

      return {
        severity: "Unknown",
        explanation: "The service could not generate a reliable explanation.",
        disclaimer:
          "This information is for educational purposes only. Consult your healthcare provider.",
      };
    }
  } catch (apiErr) {
    console.error("OpenAI API error:\n", {
      error: apiErr.message,
      errorType: apiErr.name,
      errorCode: apiErr.code,
      itemPair: `${a.name} + ${b.name}`,
      stack: apiErr.stack?.substring(0, 500),
    });

    return {
      severity: "Unknown",
      explanation: "The service is temporarily unavailable.",
      disclaimer:
        "This information is for educational purposes only. Consult your healthcare provider.",
    };
  }
}

// Get AI interaction for multiple items
export async function getAIMultipleItemsInteraction(items) {
  console.log("Starting AI interaction check for multiple items...");

  const itemsList = items.map((item, index) => `${index + 1}. ${item.name} (${item.type})`).join('\n');

  const prompt = `
    You are a medical assistant. 
    Given these ${items.length} items:
    ${itemsList}

    1. Determine if there are any potential interactions between these items when taken together.
    2. Classify the overall severity as Minor, Moderate, or Severe (based on the highest severity interaction found).
    3. Write a comprehensive explanation of all interactions found.
    4. Write a disclaimer message in 1 sentence.

    Return a JSON object like this:
    {
      "severity": "...",
      "explanation": "...",
      "disclaimer": "..."
    }
  `;

  console.log("Sending request to OpenAI for multiple items:\n", {
    model: "gpt-4o-mini",
    temperature: 0.2,
    promptLength: prompt.length,
    itemCount: items.length,
    items: items.map(item => ({ name: item.name, type: item.type }))
  });

  try {
    const response = await OpenAIClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    console.log("Received response from OpenAI for multiple items:\n", {
      model: response.model,
      usage: response.usage,
      finishReason: response.choices[0]?.finish_reason,
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });

    // Parse AI response
    try {
      const text = response.choices[0].message.content;
      console.log("Raw AI response for multiple items:\n", {
        responseText:
          text?.substring(0, 200) + (text?.length > 200 ? "..." : ""),
        fullLength: text?.length || 0,
      });

      // Clean the response text to extract JSON
      let cleanedText = text.trim();
      
      // Remove markdown code blocks if present
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to find JSON object in the text
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      console.log("Cleaned AI response for multiple items:\n", {
        cleanedText: cleanedText.substring(0, 200) + (cleanedText.length > 200 ? "..." : ""),
        fullLength: cleanedText.length,
      });

      const parsedResponse = JSON.parse(cleanedText);

      console.log("Successfully parsed AI response for multiple items:\n", {
        severity: parsedResponse.severity,
        explanationLength: parsedResponse.explanation?.length || 0,
        disclaimerLength: parsedResponse.disclaimer?.length || 0,
        hasAllRequiredFields: !!(
          parsedResponse.severity &&
          parsedResponse.explanation &&
          parsedResponse.disclaimer
        ),
      });

      return parsedResponse;
    } catch (parseErr) {
      console.error("JSON parse error for multiple items:\n", {
        error: parseErr.message,
        itemCount: items.length,
      });

      return {
        severity: "Unknown",
        explanation: "The service could not generate a reliable explanation.",
        disclaimer:
          "This information is for educational purposes only. Consult your healthcare provider.",
      };
    }
  } catch (apiErr) {
    console.error("OpenAI API error for multiple items:\n", {
      error: apiErr.message,
      errorType: apiErr.name,
      errorCode: apiErr.code,
      itemCount: items.length,
      stack: apiErr.stack?.substring(0, 500),
    });

    return {
      severity: "Unknown",
      explanation: "The service is temporarily unavailable.",
      disclaimer:
        "This information is for educational purposes only. Consult your healthcare provider.",
    };
  }
}
