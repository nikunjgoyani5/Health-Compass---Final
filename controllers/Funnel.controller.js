// ---------- DO NOT USE --------------


// =============================================================================

// import Joi from "joi";
// import { SupplementDetails } from "../models/suppliments.model.js";
// import FunnelRequestMock from "../models/Funnel.model.js";
// import { OpenAI } from "openai";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// const NON_VEG_INGREDIENTS = ["gelatin", "omega-3 from fish", "beef extract", "fish oil"];

// const isNonVeg = (ingredients = []) => {
//   return ingredients.some((i) =>
//     NON_VEG_INGREDIENTS.includes(i.toLowerCase())
//   );
// };


// const scoreSupplement = (supp, healthGoal, knownConditions) => {
//   let score = 0;
//   const textFields = [
//     supp.data?.fullName,
//     supp.data?.brandName,
//     supp.data?.statements?.notes,
//     ...((supp.data?.ingredientRows || []).map((i) => i.name) || []),
//   ]
//     .join(" ")
//     .toLowerCase();

//   if (textFields.includes(healthGoal.toLowerCase())) score += 2;
//   for (const condition of knownConditions) {
//     if (textFields.includes(condition.toLowerCase())) score += 1;
//   }

//   return score;
// };

// const getGPTDosageReason = async (supplement, healthGoal) => {
//   try {
//     const res = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: [
//         {
//           role: "user",
//           content: `Why is "${supplement}" helpful for the goal: "${healthGoal}"? Respond in one line.`,
//         },
//       ],
//       max_tokens: 60,
//       temperature: 0.6,
//     });

//     return res.choices?.[0]?.message?.content?.trim() || "";
//   } catch (e) {
//     console.warn("GPT reason failed, using fallback.");
//     return `Relevant to goal: ${healthGoal}`;
//   }
// };

// export const funnelMockEngine = async (req, res) => {
//   try {
//     const schema = Joi.object({
//       healthGoal: Joi.string().required(),
//       knownConditions: Joi.array().items(Joi.string()).default([]),
//       preferences: Joi.object({
//         vegetarian: Joi.boolean().default(false),
//         avoid: Joi.array().items(Joi.string()).default([]),
//       }).default(),
//     });

//     const { value: input, error } = schema.validate(req.body, {
//       stripUnknown: true,
//     });

//     if (error) {
//       return res
//         .status(400)
//         .json({ message: "Invalid input", details: error.message });
//     }

//     const user = req.user?.id || "guest";

//     const { healthGoal, knownConditions, preferences } = input;

//     const cleanedQuery = healthGoal
//       .replace(/[^a-zA-Z0-9\s]/g, "")
//       .trim()
//       .split(" ")
//       .join("|");

//     const regex = new RegExp(cleanedQuery, "i");

//     const searchQuery = {
//       $or: [
//         { "data.fullName": { $regex: regex } },
//         { "data.brandName": { $regex: regex } },
//         { "data.ingredientRows.name": { $regex: regex } },
//         { "data.statements.notes": { $regex: regex } },
//         { "data.claims.langualCodeDescription": { $regex: regex } },
//         { "data.productType.langualCodeDescription": { $regex: regex } },
//         { "data.netContents.display": { $regex: regex } },
//         { "data.contactDetails.name": { $regex: regex } },
//       ],
//     };

//     const foundSupplements = await SupplementDetails.find(searchQuery).limit(5);
//     const stack = [];
//     const warnings = [];

//     for (const supp of foundSupplements) {
//       const fullName = supp.data?.fullName || "Unnamed Supplement";
//       const ingredients = (supp.data?.ingredientRows || []).map((i) =>
//         i.name?.toLowerCase()
//       );

//       const matchAvoid = preferences.avoid.find((avoidItem) =>
//         ingredients.includes(avoidItem.toLowerCase())
//       );

//       const vegConflict =
//         preferences.vegetarian && isNonVeg(ingredients);

//       const score = scoreSupplement(supp, healthGoal, knownConditions);

//       const reason = await getGPTDosageReason(fullName, healthGoal);

//       if (matchAvoid) {
//         warnings.push(`Avoided ingredient in: ${fullName}`);
//       }
//       if (vegConflict) {
//         warnings.push(`Non-veg conflict in: ${fullName}`);
//       }

//       stack.push({
//         supplement: fullName,
//         dosage: "500mg once daily",
//         reason,
//         flagged: matchAvoid || vegConflict,
//         conflicts: {
//           avoidMatch: !!matchAvoid,
//           vegetarianConflict: !!vegConflict,
//         },
//         score,
//       });
//     }

//     stack.sort((a, b) => b.score - a.score);

//     const timestamp = new Date().toISOString();

//     const response = {
//       stack,
//       meta: {
//         generatedBy: "real-funnel-v2",
//         timestamp,
//         warnings,
//       },
//     };

//     await FunnelRequestMock.create({
//       user_id: user,
//       healthGoal,
//       knownConditions,
//       preferences,
//       stackCount: stack.length,
//       warnings,
//       createdAt: new Date(),
//     });

//     return res.json(response);
//   } catch (err) {
//     console.error("❌ Funnel Mock Error:", err.message);
//     return res
//       .status(500)
//       .json({ message: "Internal error in funnel mock engine." });
//   }
// };
