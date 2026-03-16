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
import { postJson, type JsonRpcLikeRequest, type JsonRpcLikeResponse } from "./http.js";
import { parseWithSchema } from "./validate.js";

export interface LocalLLMClientOptions {
  /**
   * HTTP endpoint for your self-hosted model router.
   * It should accept POST { task, input, model? } and return { output }.
   */
  endpointUrl: string;
  model?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class LocalLLMClient implements LLMClient {
  readonly kind = "local" as const;
  readonly name: string;

  private readonly endpointUrl: string;
  private readonly model: string | undefined;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(opts: LocalLLMClientOptions) {
    this.endpointUrl = opts.endpointUrl;
    this.model = opts.model;
    this.headers = opts.headers ?? {};
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.name = `LocalLLM(${this.model ?? "default"})`;
  }

  async normalizeJD(input: JdRawInput): Promise<JdNormalized> {
    const req: JsonRpcLikeRequest = { task: "normalize_jd", input, model: this.model };
    const res = await postJson<JsonRpcLikeResponse>(
      this.endpointUrl,
      req,
      this.headers,
      this.timeoutMs
    );
    return parseWithSchema(JdNormalizedSchema, res.output, "normalizeJD");
  }

  async classifyBulletsToCompetencies(
    input: BulletClassificationRequest
  ): Promise<BulletClassificationResult> {
    const req: JsonRpcLikeRequest = {
      task: "classify_bullets_to_competencies",
      input,
      model: this.model,
    };
    const res = await postJson<JsonRpcLikeResponse>(
      this.endpointUrl,
      req,
      this.headers,
      this.timeoutMs
    );
    return parseWithSchema(
      BulletClassificationResultSchema,
      res.output,
      "classifyBulletsToCompetencies"
    );
  }

  async suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult> {
    const req: JsonRpcLikeRequest = { task: "suggest_bullet_rewrites", input, model: this.model };
    const res = await postJson<JsonRpcLikeResponse>(
      this.endpointUrl,
      req,
      this.headers,
      this.timeoutMs
    );
    return parseWithSchema(
      BulletRewriteResultSchema,
      res.output,
      "suggestBulletRewrites"
    );
  }

  async explainFit(input: FitExplanationRequest): Promise<FitExplanationResult> {
    const req: JsonRpcLikeRequest = { task: "explain_fit", input, model: this.model };
    const res = await postJson<JsonRpcLikeResponse>(
      this.endpointUrl,
      req,
      this.headers,
      this.timeoutMs
    );
    return parseWithSchema(FitExplanationResultSchema, res.output, "explainFit");
  }
}

