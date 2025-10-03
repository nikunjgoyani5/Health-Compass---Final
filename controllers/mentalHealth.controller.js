import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import MentalHealth from "../models/mentalhealth.assessment.schema.js";

const OPTIONS = {
  frequency4: ["Never", "Occasionally", "Frequently", "Nearly every day"],
  frequencyStress: ["Never", "Occasionally", "Frequently", "Constantly"],
  enjoy: ["Always", "Sometimes", "Rarely", "Never"],
  sleepQuality: ["Excellent", "Good", "Poor", "Very Poor"],
  connected: [
    "Very connected",
    "Somewhat connected",
    "Not very connected",
    "Completely isolated",
  ],
  coping: ["Very well", "Somewhat well", "Poorly", "Not at all"],
  yesNo: ["Yes", "Sometimes", "Rarely", "No"],
  yesMaybeNo: ["Yes", "Maybe", "No"], // 3-point
  sleepFreq: ["Never", "Occasionally", "Frequently", "Every night"], // for Sleep q2
};

// which scale each question uses
const SCALE_MAP = {
  "General Wellbeing": { q1: "frequency4", q2: "frequency4", q3: "enjoy" },
  "Stress & Anxiety": { q1: "frequencyStress", q2: "frequencyStress" },
  "Sleep Patterns": { q1: "sleepQuality", q2: "sleepFreq" },
  "Social & Emotional Health": { q1: "connected", q2: "frequencyStress" },
  "Coping & Resilience": { q1: "coping", q2: "yesNo" },
  "Final Thoughts": { q1: "yesMaybeNo", q2: "yesNo" },
};

// points: 4-point → 1:100, 2:66.67, 3:33.33, 4:0 ; 3-point → 1:100, 2:50, 3:0
const P4 = [null, 100, 66.67, 33.33, 0];
const P3 = [null, 100, 50, 0];

const labelToIndex = (arr, label) => {
  const L = String(label).trim().toLowerCase();
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].toLowerCase() === L) return i + 1; // return 1-based index
  }
  return -1;
};

const scoreToLevel = (pct) => {
  if (pct >= 80)
    return {
      level: "Excellent",
      advice:
        "You’re doing great. Maintain healthy habits and regular check-ins.",
    };
  if (pct >= 65)
    return {
      level: "Good",
      advice:
        "Overall wellbeing looks good. Keep sleep, movement, and connections steady.",
    };
  if (pct >= 50)
    return {
      level: "Fair",
      advice:
        "Some areas need attention. Consider stress management and better sleep hygiene.",
    };
  if (pct >= 35)
    return {
      level: "Concerning",
      advice: "Indicators need support. Consider structured routines and help.",
    };
  return {
    level: "High Risk",
    advice:
      "Strong indicators of distress. Please consider speaking with a professional soon.",
  };
};

function computeScoreFromSections(sections) {
  const errors = [];
  const points = [];

  for (const sec of sections || []) {
    const mapForSection = SCALE_MAP[sec.sectionName];
    if (!mapForSection) continue; // ignore unknown sections

    const answersObj = sec.answers || {};
    for (const [qId, scaleKey] of Object.entries(mapForSection)) {
      if (!(qId in answersObj)) continue; // unanswered -> skip

      const label = answersObj[qId];
      const list = OPTIONS[scaleKey];
      if (!list) {
        errors.push(
          `Invalid question format for ${sec.sectionName} question ${qId}. Please check the questionnaire structure.`
        );
        continue;
      }

      const idx = labelToIndex(list, label);
      if (idx === -1) {
        errors.push(
          `Invalid answer '${label}' for ${sec.sectionName} question ${qId}. ` +
            `Please choose from: ${list.join(", ")}`
        );
        continue;
      }

      const p = scaleKey === "yesMaybeNo" ? P3[idx] ?? null : P4[idx] ?? null;
      if (typeof p === "number") points.push(p);
    }
  }

  if (errors.length) {
    const err = new Error(errors.join(" | "));
    err.status = StatusCodes.BAD_REQUEST;
    throw err;
  }

  if (!points.length) {
    return {
      percentage: 0,
      level: "Incomplete",
      advice: "Please complete at least one question to generate your mental health score.",
      answeredCount: 0,
    };
  }

  const avg = points.reduce((a, b) => a + b, 0) / points.length;
  const percentage = Math.round(avg * 100) / 100; // 2 decimals
  const { level, advice } = scoreToLevel(percentage);
  return { percentage, level, advice, answeredCount: points.length };
}

/**
 * POST /api/mental-health/fillup
 * Body: { sections: [ { sectionName, answers: { q1: "Label", ... } }, ... ] }
 * Upserts (one record per user) and returns the computed score.
 */
export const fillupMentalHealth = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { sections } = req.body || {};

    if (!Array.isArray(sections) || sections.length === 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Please provide the mental health questionnaire sections to complete your assessment.",
        data: null,
      });
    }

    // 1) compute score from payload
    const score = computeScoreFromSections(sections);

    console.log({ score });

    // 2) upsert user record (create if not exists, else replace sections)
    await MentalHealth.findOneAndUpdate(
      { userId },
      {
        $set: {
          sections,
          percentage: score.percentage,
          level: score.level,
          advice: score.advice,
          answeredCount: score.answeredCount,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // 3) respond with score (200 as requested)
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Your mental health assessment has been completed successfully.",
      data: score, // { percentage, level, advice, answeredCount }
    });
  } catch (error) {
    const status = error.status || StatusCodes.INTERNAL_SERVER_ERROR;
    return apiResponse({
      res,
      status: false,
      statusCode: status,
      message:
        status === StatusCodes.BAD_REQUEST
          ? "Please check your answers and try again."
          : "Something went wrong. Please try again later.",
      error: error?.message,
    });
  }
};
