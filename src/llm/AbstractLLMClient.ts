import type { LLMClient } from "./LLMClient.js";
import {
  BulletClassificationResultSchema,
  BulletRewriteResultSchema,
  FitExplanationResultSchema,
  JdNormalizedSchema,
  type BulletClassificationRequest,
  type BulletClassificationResult,
  type BulletRewriteRequest,
  type BulletRewriteResult,
  type FitExplanationRequest,
  type FitExplanationResult,
  type JdNormalized,
  type JdRawInput,
} from "./schemas/index.js";
import { parseWithSchema } from "./validate.js";
import {
  fallbackBulletRewriteResult,
  normalizeBulletRewriteResult,
  rewriteBulletsUserPrompt,
} from "./bulletRewriteNormalization.js";
import {
  fallbackJdNormalized,
  normalizeJdResult,
  normalizeJdUserPrompt,
} from "./jdNormalization.js";
import {
  classifyBulletsPrompt,
  explainFitPrompt,
  fallbackFitExplanationResult,
  normalizeFitResult,
} from "./fitExplanationNormalization.js";

export const SYSTEM_JSON_ONLY =
  "You are a precise assistant for resume and job-description analysis. " +
  "Respond with ONLY valid JSON. No markdown code fences, no commentary before or after the JSON.";

export abstract class AbstractLLMClient implements LLMClient {
  abstract kind: "local" | "portfolio";
  abstract name: string;

  /** Implementations must return a parsed JSON object/array from the LLM. */
  protected abstract completeJson(system: string, user: string): Promise<unknown>;

  async normalizeJD(input: JdRawInput): Promise<JdNormalized> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, normalizeJdUserPrompt(input));
    const normalized = normalizeJdResult(raw, input.text);
    const parsed = JdNormalizedSchema.safeParse(normalized);
    if (parsed.success) return parsed.data;
    return fallbackJdNormalized(input);
  }

  async classifyBulletsToCompetencies(
    input: BulletClassificationRequest
  ): Promise<BulletClassificationResult> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, classifyBulletsPrompt(input));
    return parseWithSchema(
      BulletClassificationResultSchema,
      raw,
      "classifyBulletsToCompetencies"
    );
  }

  async suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, rewriteBulletsUserPrompt(input));
    const normalized = normalizeBulletRewriteResult(raw, input);
    const parsed = BulletRewriteResultSchema.safeParse(normalized);
    if (parsed.success) return parsed.data;
    return fallbackBulletRewriteResult(input);
  }

  async explainFit(input: FitExplanationRequest): Promise<FitExplanationResult> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, explainFitPrompt(input));
    const normalized = normalizeFitResult(raw);
    const parsed = FitExplanationResultSchema.safeParse(normalized);
    if (parsed.success) return parsed.data;
    return fallbackFitExplanationResult(input, raw);
  }
}
