import SupplementModel from "../models/supplements.model.js";
import { scoreSupplementForGoals } from "../utils/scoring.js";
import HealthGoalModel from "../models/healthGoal.model.js";
import {
  deriveUserGoalsFromOnboarding,
  deriveUserGoalsFromRecord,
} from "../utils/goal.mapping.js";
import { aiRankAndExplain, ruleConfidence } from "./openAi.service.js";
import RecommendationLogModel from "../models/recommendation-log.model.js";
import SupplementRecommendationStack from "../models/supplement.recommendation.stack.model.js";
import { UserRecommendation } from "../models/user.supplement.recommendation.model.js";
import mongoose from "mongoose";
import Onboarding from "../models/onboarding.model.js";

const FORCE_AI_SELECTED =
  String(process.env.FORCE_AI_SELECTED ?? "true").toLowerCase() === "true";

const normalizeIds = (ids = []) =>
  ids
    .filter(Boolean)
    .map((id) =>
      typeof id === "string" ? new mongoose.Types.ObjectId(id) : id
    );

// Helper function to build consistent payload structure
const buildPayload = ({
  supp,
  confidence,
  matchedGoals,
  tag,
  insight,
  reason,
}) => ({
  supplement: supp,
  confidence_score: confidence,
  confidence_label:
    confidence >= 70 ? "High" : confidence >= 40 ? "Medium" : "Low",
  matched_goals: matchedGoals,
  recommendation_tag: tag,
  ai_insight: insight,
  reason,
});

export async function pickNextSuggestion({ userId, excludeIds = [] }) {
  // 1) Parallel: Get user goals and prepare query
  const [goalsDoc] = await Promise.all([
    HealthGoalModel.findOne({ userId }).lean(),
  ]);

  const userGoals = deriveUserGoalsFromRecord(goalsDoc);

  // 2) base query + exclusions
  const q = { isAvailable: true };
  const excluded = normalizeIds(excludeIds);
  if (excluded.length) q._id = { $nin: excluded };

  // 3) candidates
  const candidates = await SupplementModel.find(q).limit(50).lean();
  if (!candidates.length) return null;

  // 4) rules score
  const scored = candidates
    .map((s) => {
      const { score, matchedGoals } = scoreSupplementForGoals(s, userGoals);
      return { s, score, matchedGoals };
    })
    .sort((a, b) => b.score - a.score);

  // 5) AI re-rank + AI confidence (parallel with scoring)
  const {
    insight,
    aiTopId,
    usedAI,
    confidence: aiConfidence,
  } = await aiRankAndExplain({
    userGoals,
    candidates,
  });

  let top = scored[0];
  if (aiTopId) {
    const found = scored.find((x) => String(x.s._id) === String(aiTopId));
    if (found) top = found;
  }

  // 6) tag
  const finalTag =
    usedAI && FORCE_AI_SELECTED
      ? "AI Selected"
      : usedAI
      ? "AI Selected"
      : "Smart Suggestion";

  // 7) confidence_score (AI first, else rule-based fallback that considers matched goals)
  const confidence =
    usedAI && Number.isFinite(aiConfidence)
      ? Math.round(Math.max(0, Math.min(100, aiConfidence)))
      : ruleConfidence(top.score, top.matchedGoals.length);

  // 8) log (async, don't wait)
  RecommendationLogModel.create({
    userId,
    supplementId: top.s._id,
    action: "suggested",
    meta: { userGoals, score: top.score, tag: finalTag, confidence },
  }).catch((err) => console.error("Failed to log recommendation:", err));

  // 9) payload
  return buildPayload({
    supp: top.s,
    confidence,
    matchedGoals: top.matchedGoals,
    tag: finalTag,
    insight,
  });
}

function buildUserContextPrompt({ onboardingDoc, goalsDoc }) {
  let parts = [];

  if (onboardingDoc) {
    if (onboardingDoc.age) parts.push(`Age: ${onboardingDoc.age}`);
    if (onboardingDoc.gender) parts.push(`Gender: ${onboardingDoc.gender}`);
    if (onboardingDoc.weightKg)
      parts.push(`Weight: ${onboardingDoc.weightKg}kg`);
    if (onboardingDoc.height)
      parts.push(
        `Height: ${onboardingDoc.height}${onboardingDoc.heightUnit || "cm"}`
      );
    if (onboardingDoc.activityLevel)
      parts.push(`Activity level: ${onboardingDoc.activityLevel}`);
    if (onboardingDoc.goal?.length)
      parts.push(`Goals from onboarding: ${onboardingDoc.goal.join(", ")}`);
  }

  if (goalsDoc) {
    if (goalsDoc.sleepTarget > 0)
      parts.push(`Wants to improve sleep (${goalsDoc.sleepTarget} hrs target)`);
    if (goalsDoc.waterIntake > 0)
      parts.push(`Wants better hydration (${goalsDoc.waterIntake} ml)`);
    if (goalsDoc.weightTarget > 0)
      parts.push(`Weight target: ${goalsDoc.weightTarget} kg`);
    if (goalsDoc.dailySteps > 0)
      parts.push(`Daily steps goal: ${goalsDoc.dailySteps}`);
    if (goalsDoc.calories > 0) parts.push(`Calorie goal: ${goalsDoc.calories}`);
  }

  return parts.length
    ? `User Profile Context:\n${parts.join("\n")}`
    : "No explicit user profile context provided.";
}

export async function pickRecommendationList({
  userId,
  limit = 10,
  excludeIds = [],
}) {
  // Load stack + goals
  const [stack, goalsDoc, onboardingDoc] = await Promise.all([
    SupplementRecommendationStack.findOne({ userId })
      .select("items.supplementRecommendationId")
      .lean(),
    HealthGoalModel.findOne({ userId }).lean(),
    Onboarding.findOne({ userId }).lean(),
  ]);

  // Merge both sources
  const goalsFromHealth = deriveUserGoalsFromRecord(goalsDoc);
  const goalsFromOnboarding = deriveUserGoalsFromOnboarding(onboardingDoc);

  // Deduplicate
  const userGoals = [...new Set([...goalsFromHealth, ...goalsFromOnboarding])];

  if (!userGoals.length) return [];

  // Locked supplement IDs
  const lockedRecIds = normalizeIds(
    (stack?.items || []).map((it) => it.supplementRecommendationId)
  );
  let lockedSuppIds = [];
  if (lockedRecIds.length) {
    const lockedRecs = await UserRecommendation.find({
      _id: { $in: lockedRecIds },
    })
      .select("supplementId")
      .lean();
    lockedSuppIds = normalizeIds(lockedRecs.map((r) => r.supplementId));
  }

  // Exclusions
  const excludedSuppIds = normalizeIds([...excludeIds, ...lockedSuppIds]);
  const q = { isAvailable: true };
  if (excludedSuppIds.length) q._id = { $nin: excludedSuppIds };

  // Fetch candidates
  const max = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const candidates = await SupplementModel.find(q).limit(200).lean();
  if (!candidates.length) return [];

  // Score against goals
  const scored = candidates
    .map((s) => {
      const { score, matchedGoals } = scoreSupplementForGoals(s, userGoals);
      return { s, score, matchedGoals };
    })
    .filter((x) => x.score > 0) // 👈 only keep goal-matched
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return [];

  const topScored = scored.slice(0, max);

  const userContextPrompt = buildUserContextPrompt({ onboardingDoc, goalsDoc });

  // AI rerank (optional)
  const { insight, aiTopId, usedAI } = await aiRankAndExplain({
    userGoals,
    candidates: topScored.map((x) => x.s),
    userContextPrompt, // 👈 pass context here
  });

  // Build list with reason
  return topScored.map(({ s, score, matchedGoals }) => {
    const isAI = usedAI && aiTopId && String(s._id) === String(aiTopId);
    const tag = isAI ? "AI Selected" : "Smart Suggestion";

    const reason = matchedGoals?.length
      ? `Recommended for ${matchedGoals.join(
          ", "
        )} because this supplement directly supports those health goals.`
      : "This supplement aligns with general wellness needs.";

    // Always set ai_insight: AI item uses AI text, others use reason as the insight.
    const ai_insight = `Considering your profile: ${userContextPrompt}. ${
      matchedGoals?.length
        ? `This supplement is chosen to enhance your ${matchedGoals.join(
            ", "
          )} journey.`
        : "It complements your lifestyle and overall health objectives."
    }`;

    const conf = ruleConfidence(score, matchedGoals?.length || 0);

    return buildPayload({
      supp: s,
      confidence: conf,
      matchedGoals,
      tag,
      insight: ai_insight,
      reason,
    });
  });
}
