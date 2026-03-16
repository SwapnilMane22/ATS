import type { ResumeDocument } from "../resume/types.js";
import type { LLMClient } from "../../llm/LLMClient.js";
import {
  FitExplanationRequestSchema,
  type FitExplanationResult,
  type JdNormalized,
} from "../../llm/schemas/index.js";

export interface StrictJdFitResult {
  jd: JdNormalized;
  fit: FitExplanationResult;
}

export async function explainStrictJdFitWithLLM(
  resume: ResumeDocument,
  jd: JdNormalized,
  llm: LLMClient
): Promise<StrictJdFitResult> {
  const req = FitExplanationRequestSchema.parse({
    resume: {
      bullets: resume.bullets.map((b) => ({
        bulletId: b.bulletId,
        text: b.text,
        sectionPath: b.sectionPath,
      })),
    },
    jd,
  });

  const fit = await llm.explainFit(req);
  return { jd, fit };
}

