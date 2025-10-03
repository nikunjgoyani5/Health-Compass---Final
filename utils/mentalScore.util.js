/**
 * We translate each answer to points (0, 33.33, 66.67, 100).
 * Higher points = better wellbeing.
 *
 * Standard 4-point scale mapping (best -> worst):
 *   1 -> 100, 2 -> 66.67, 3 -> 33.33, 4 -> 0
 *
 * For 3-point question (wouldSeekProfessional):
 *   1 -> 100 (Yes), 2 -> 50 (Maybe), 3 -> 0 (No)
 */

const P4 = [null, 100, 66.67, 33.33, 0];
const P3 = [null, 100, 50, 0];

const positiveKeys = new Set([
  "enjoyment",
  "sleepQuality", // "Excellent" & "Good" are positive (so normal P4 works)
  "connected",
  "copeAbility",
  "healthyCoping",
  "wouldSeekProfessional",
  "shareMore",
]);

const threePointKeys = new Set(["wouldSeekProfessional"]);

export function computeMentalHealthScore(doc) {
  const values = [];
  const add = (key, valObj) => {
    if (!valObj || typeof valObj.value !== "number") return;
    const v = valObj.value;

    if (threePointKeys.has(key)) {
      values.push(P3[v] ?? null);
      return;
    }

    // default 4-scale mapping:
    let points = P4[v] ?? null;

    // For "sleepQuality", the labels are positive for 1/2 and negative for 3/4,
    // but our mapping already treats 1 best -> 4 worst, so no inversion needed.
    // For all "positiveKeys" we use the same mapping (1 best).
    // For "negative" items (not in positiveKeys), mapping already aligns (1=Never best).

    values.push(points);
  };

  Object.entries(doc.toObject ? doc.toObject() : doc).forEach(([k, v]) => {
    // whitelist of question keys we consider
    const keys = [
      "depressedHopeless",
      "lowEnergy",
      "enjoyment",
      "overwhelmed",
      "anxious",
      "sleepQuality",
      "insomnia",
      "connected",
      "loneliness",
      "copeAbility",
      "healthyCoping",
      "wouldSeekProfessional",
      "shareMore",
    ];
    if (keys.includes(k)) add(k, v);
  });

  const answered = values.filter((x) => typeof x === "number");
  if (!answered.length) {
    return {
      percentage: 0,
      level: "Incomplete",
      advice: "Please answer the questions.",
      answeredCount: 0,
    };
  }

  const total = answered.reduce((a, b) => a + b, 0);
  const percentage = Math.round((total / answered.length) * 100) / 100; // 2 decimals

  let level = "Good";
  let advice =
    "Overall wellbeing looks good. Keep up healthy routines like sleep hygiene, movement, journaling, and supportive relationships.";

  if (percentage >= 80) {
    level = "Excellent";
    advice =
      "You’re doing great. Maintain your healthy habits and check in with yourself regularly.";
  } else if (percentage >= 65) {
    level = "Good";
  } else if (percentage >= 50) {
    level = "Fair";
    advice =
      "Some areas need attention. Consider improving sleep, stress management, or talking with a trusted person.";
  } else if (percentage >= 35) {
    level = "Concerning";
    advice =
      "Multiple risk indicators. Consider structured support, lifestyle adjustments, and possibly a professional consult.";
  } else {
    level = "High Risk";
    advice =
      "Strong indicators of distress. We recommend speaking with a licensed mental health professional as soon as possible.";
  }

  return { percentage, level, advice, answeredCount: answered.length };
}

/**
 * Optional helper to normalize FE checkbox payload to { value } integers.
 * Example accepted shapes:
 *   { value: 2 }
 *   { options: { "1": false, "2": true, "3": false, "4": false } }
 */
export function normalizeToValue(obj, max = 4) {
  if (!obj) return undefined;
  if (typeof obj.value === "number") return { value: obj.value };

  if (obj.options && typeof obj.options === "object") {
    const selected = Object.entries(obj.options).find(([, isTrue]) => !!isTrue);
    if (selected) {
      const v = Number(selected[0]);
      if (Number.isInteger(v) && v >= 1 && v <= max) return { value: v };
    }
  }
  return undefined;
}
