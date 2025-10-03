// utils/miniBot.utils.js

export const BOT_TITLE = "Guidance & Quick Solution Bot";

// ===== Top-level menu =====
const MAIN_MENU = [
  { id: "support", label: "Support" },
  { id: "pricing_plans", label: "Pricing & Plans" },
  { id: "ai_guidance", label: "AI Guidance" },
];

// ===== Answers =====
const ANSWERS = {
  // Support
  support:
    "Support topics — pick one:",
  support_set_medicine_reminder:
    "Go to Health Tools → Reminders → Add Medicine Reminder. Enter name, dosage, and time(s). The app will notify you automatically.",
  support_track_activity:
    "Open the Dashboard → Daily Activity. You’ll see steps, sleep, hydration, and any logged notes.",
  support_edit_goals:
    "Go to Profile → Health Goals. Tap a goal to adjust target, duration, or reminders; save to apply instantly.",
  support_sync_device:
    "Open Settings → Connected Devices and choose your wearable (e.g., Google Fit/Apple Health). Grant permissions to sync steps, sleep, and heart data.",

  // Pricing & Plans
  pricing_plans:
    "Pricing & Plans — pick one:",
  plan_list:
    "Health Compass offers a Free Basic plan (reminders, activity tracking, AI guidance). Paid plans unlock deeper supplement insights, personalized recommendations, and premium tools. Manage anytime in Account → Subscription.",
  plan_change:
    "Yes—go to Account → Subscription, pick a new plan, and confirm. Changes apply immediately and billing adjusts automatically.",
  plan_billing_history:
    "Open Account → Billing History to view invoices, payment status, and download receipts.",

  // AI Guidance
  ai_guidance:
    "AI Guidance — pick one:",
  ai_suggest_supplements:
    "Yes—open AI Guidance, enter goals (sleep, energy, focus, immunity), and you’ll get supplement suggestions aligned with your profile.",
  ai_wellness_plan:
    "In AI Guidance, choose Create Wellness Plan, answer a few questions, and get a tailored plan with habits, reminders, and check-ins.",
  ai_track_progress:
    "Yes—AI summarizes weekly progress from your logs and device data, highlighting trends and sending nudges when you’re off-track.",
};

// ===== Follow-up suggestions =====
const FOLLOWUPS = {
  support: [
    { id: "support_set_medicine_reminder", label: "Set a medicine reminder" },
    { id: "support_track_activity", label: "Track daily activity" },
    { id: "support_edit_goals", label: "Edit/update health goals" },
    { id: "support_sync_device", label: "Sync wearable/device" },
  ],
  pricing_plans: [
    { id: "plan_list", label: "Available pricing plans" },
    { id: "plan_change", label: "Change/upgrade/downgrade" },
    { id: "plan_billing_history", label: "See billing history" },
  ],
  ai_guidance: [
    { id: "ai_suggest_supplements", label: "AI: suggest supplements" },
    { id: "ai_wellness_plan", label: "AI: wellness plan" },
    { id: "ai_track_progress", label: "AI: track progress" },
  ],
};

// ===== GPT-based classifier (always used) =====
export async function classifyUserMessageAI(message = "") {
  const { OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const SYSTEM = `
Classify the user's message into ONE of these intent IDs (JSON only):
Top-level: "support", "pricing_plans", "ai_guidance"
Support leaf: "support_set_medicine_reminder", "support_track_activity", "support_edit_goals", "support_sync_device"
Pricing leaf: "plan_list", "plan_change", "plan_billing_history"
AI leaf: "ai_suggest_supplements", "ai_wellness_plan", "ai_track_progress"

Return ONLY: {"intent":"<one id>"} — no prose. If unclear, pick a top-level.
`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4",
    temperature: 0,
    max_tokens: 20,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Message: ${message || ""}`.slice(0, 500) },
    ],
  });

  try {
    const raw = resp.choices?.[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw);
    return parsed.intent || "support";
  } catch {
    return "support";
  }
}

// ===== Accessors =====
export function getAnswerByIntent(intentId) {
  return ANSWERS[intentId] || "Choose a topic below.";
}

export function getFollowupsForIntent(intentId) {
  return FOLLOWUPS[intentId] || MAIN_MENU;
}

export function getMainMenu() {
  return MAIN_MENU;
}
