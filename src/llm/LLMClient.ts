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

export type LLMClientKind = "local" | "portfolio";

export interface LLMClient {
  readonly kind: LLMClientKind;
  readonly name: string;

  normalizeJD(input: JdRawInput): Promise<JdNormalized>;

  classifyBulletsToCompetencies(
    input: BulletClassificationRequest
  ): Promise<BulletClassificationResult>;

  suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult>;

  explainFit(input: FitExplanationRequest): Promise<FitExplanationResult>;
}

