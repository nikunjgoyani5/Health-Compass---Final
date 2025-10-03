import { GOAL_KEYWORDS } from "./goal.mapping.js";

export const toBag = (s) => (s == null ? "" : String(s)).toLowerCase();

export const bagArray = (arr) => {
  if (arr == null) return [];
  const list = Array.isArray(arr) ? arr : [arr];
  return list.flatMap((x) => {
    if (x == null) return [];
    if (
      typeof x === "string" ||
      typeof x === "number" ||
      typeof x === "boolean"
    )
      return [String(x).toLowerCase()];
    if (Array.isArray(x)) return x.map((y) => String(y ?? "").toLowerCase());
    if (typeof x === "object") {
      for (const key of ["name", "label", "title", "value"]) {
        if (x[key] != null) return [String(x[key]).toLowerCase()];
      }
      return Object.values(x).map((v) => String(v ?? "").toLowerCase());
    }
    return [String(x).toLowerCase()];
  });
};

export function scoreSupplementForGoals(supplement, userGoals) {
  const matchedGoals = [];
  let score = 0;

  // Check each goal against supplement keywords
  for (const goal of userGoals) {
    const keywords = GOAL_KEYWORDS[goal] || [];
    const text = `${supplement.name || ""} ${
      supplement.description || ""
    }`.toLowerCase();

    const matched = keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (matched) {
      matchedGoals.push(goal);
      score += 30; // weight per matched goal
    }
  }

  return { score, matchedGoals };
}

export function confidenceLabel(score) {
  const s = Number.isFinite(score) ? score : 0;
  if (s >= 70) return "High";
  if (s >= 40) return "Medium";
  return "Low";
}
