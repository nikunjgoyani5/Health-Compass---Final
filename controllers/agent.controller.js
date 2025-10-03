// -------------------------------
// RecommendationCardSchema (Validation Schema)
// -------------------------------
// Defines the expected structure for a recommendation card object used in the Agent module.
// Ensures all required fields are present and correctly typed before processing.
// Fields:
//   - taskId: Unique identifier of the task (string, required).
//   - recommendationText: The recommendation content to be displayed to the user (string, required).
//   - metadata: Optional additional data for internal use (object, defaults to empty object).
//   - context: Contextual information to link the recommendation to a workflow or scenario (string, required).
//   - ctaLabel: Predefined action label for the card's call-to-action button (enum: "Add Supplement", "Create Plan", "Log hydration").
//   - disclaimer: Any legal or advisory text that must accompany the recommendation (string, required).
// Strict mode is enabled to prevent extra unexpected fields.

import { z } from "zod";
export const RecommendationCardSchema = z.object({
  taskId: z.string().min(1),
  recommendationText: z.string().min(1),
  metadata: z.record(z.any()).default({}),
  context: z.string().min(1),
  ctaLabel: z.enum(["Add Supplement","Create Plan","Log hydration"]),
  disclaimer: z.string().min(1)
}).strict();
export default RecommendationCardSchema;
