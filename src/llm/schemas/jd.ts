import { z } from "zod";
import { PlainTextSchema } from "./common.js";

export const JdRawInputSchema = z.object({
  text: PlainTextSchema,
  url: z.string().url().optional(),
  title: z.string().min(1).optional(),
  capturedAtIso: z.string().datetime().optional(),
});
export type JdRawInput = z.infer<typeof JdRawInputSchema>;

export const JdRequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["must_have", "nice_to_have", "responsibility"]),
  category: z
    .enum([
      "hard_skill",
      "soft_skill",
      "domain",
      "seniority",
      "education",
      "other",
    ])
    .default("other"),
  signals: z.array(z.string().min(1)).default([]),
});
export type JdRequirement = z.infer<typeof JdRequirementSchema>;

export const JdNormalizedSchema = z.object({
  summary: z.string().min(1),
  requirements: z.array(JdRequirementSchema),
  mustHaveIds: z.array(z.string().min(1)).default([]),
  niceToHaveIds: z.array(z.string().min(1)).default([]),
  responsibilityIds: z.array(z.string().min(1)).default([]),
  inferredRoleTitles: z.array(z.string().min(1)).default([]),
  senioritySignals: z.array(z.string().min(1)).default([]),
});
export type JdNormalized = z.infer<typeof JdNormalizedSchema>;

