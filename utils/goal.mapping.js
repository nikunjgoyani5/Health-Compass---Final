export const GOAL_KEYWORDS = {
  "Better Sleep": [
    "sleep",
    "insomnia",
    "melatonin",
    "magnesium",
    "glycine",
    "l-theanine",
  ],
  Hydration: [
    "hydration",
    "electrolyte",
    "electrolytes",
    "sodium",
    "potassium",
  ],
  "Weight Management": [
    "weight",
    "fat burn",
    "metabolism",
    "appetite",
    "glucomannan",
    "garcinia",
  ],
  "Active Lifestyle": ["endurance", "recovery", "muscle", "stamina", "energy"],
  "Calorie Control": ["calorie", "satiety", "appetite", "fiber"],
};

export function deriveUserGoalsFromRecord(goalDoc) {
  const goals = [];
  if (goalDoc?.sleepTarget > 0) goals.push("Better Sleep");
  if (goalDoc?.waterIntake > 0) goals.push("Hydration");
  if (goalDoc?.weightTarget > 0) goals.push("Weight Management");
  if (goalDoc?.dailySteps > 0) goals.push("Active Lifestyle");
  if (goalDoc?.calories > 0) goals.push("Calorie Control");
  return goals;
}

export function deriveUserGoalsFromOnboarding(onboardingDoc) {
  if (!onboardingDoc?.goal?.length) return [];
  return onboardingDoc.goal;
}
