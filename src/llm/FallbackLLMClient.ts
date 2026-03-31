import type { LLMClient } from "./LLMClient.js";
import type {
  BulletClassificationRequest,
  BulletClassificationResult,
  BulletRewriteRequest,
  BulletRewriteResult,
  FitExplanationRequest,
  FitExplanationResult,
  JdNormalized,
  JdRawInput,
} from "./schemas/index.js";

export class FallbackLLMClient implements LLMClient {
  readonly kind = "local" as const;
  readonly name: string;

  constructor(
    private readonly primary: LLMClient,
    private readonly fallback: LLMClient
  ) {
    this.name = `FallbackLLM(${primary.name} -> ${fallback.name})`;
  }

  private async withFallback<T>(label: string, fn: (c: LLMClient) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary);
    } catch (err) {
      if (process.env.ATS_DEBUG_LLM === "1" || process.env.ATS_DEBUG_LLM === "true") {
        console.error(
          `[ATS LLM] ${label} primary failed (${this.primary.name}), fallback -> ${this.fallback.name}:`,
          err instanceof Error ? err.message : err
        );
      }
      return fn(this.fallback);
    }
  }

  normalizeJD(input: JdRawInput): Promise<JdNormalized> {
    return this.withFallback("normalizeJD", (c) => c.normalizeJD(input));
  }

  classifyBulletsToCompetencies(
    input: BulletClassificationRequest
  ): Promise<BulletClassificationResult> {
    return this.withFallback("classifyBulletsToCompetencies", (c) =>
      c.classifyBulletsToCompetencies(input)
    );
  }

  suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult> {
    return this.withFallback("suggestBulletRewrites", (c) => c.suggestBulletRewrites(input));
  }

  explainFit(input: FitExplanationRequest): Promise<FitExplanationResult> {
    return this.withFallback("explainFit", (c) => c.explainFit(input));
  }
}
