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

export type VendorProvider = "openrouter" | "google_ai_studio";

export interface VendorLLMClientOptions {
  provider: VendorProvider;
  /**
   * For OpenRouter: `https://openrouter.ai/api/v1/chat/completions`
   * For Google AI Studio (Gemini): a lightweight proxy endpoint is recommended.
   *
   * This client expects an OpenAI-compatible *router* endpoint that can accept
   * { task, input, model } (same contract as LocalLLMClient).
   *
   * Rationale: keeps the ATS engine model-agnostic and avoids baking vendor SDKs here.
   */
  endpointUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}

/**
 * Vendor client using the same "task router" contract as LocalLLMClient.
 *
 * In practice, you run a tiny server that:
 * - receives {task,input,model}
 * - calls the chosen vendor model
 * - returns {output} as strict JSON matching our schemas
 */
export class VendorLLMClient implements LLMClient {
  readonly kind = "vendor" as const;
  readonly name: string;

  private readonly provider: VendorProvider;
  private readonly endpointUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: VendorLLMClientOptions) {
    this.provider = opts.provider;
    this.endpointUrl = opts.endpointUrl;
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.extraHeaders = opts.extraHeaders ?? {};
    this.name = `VendorLLM(${this.provider}:${this.model})`;
  }

  private headers(): Record<string, string> {
    // Keep it generic; your router can interpret this.
    return {
      authorization: `Bearer ${this.apiKey}`,
      "x-ats-provider": this.provider,
      ...this.extraHeaders,
    };
  }

  async normalizeJD(input: JdRawInput): Promise<JdNormalized> {
    const req: JsonRpcLikeRequest = { task: "normalize_jd", input, model: this.model };
    const res = await postJson<JsonRpcLikeResponse>(
      this.endpointUrl,
      req,
      this.headers(),
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
      this.headers(),
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
      this.headers(),
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
      this.headers(),
      this.timeoutMs
    );
    return parseWithSchema(FitExplanationResultSchema, res.output, "explainFit");
  }
}

