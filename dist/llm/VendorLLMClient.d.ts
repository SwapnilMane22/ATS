import type { LLMClient } from "./LLMClient.js";
import { type BulletClassificationRequest, type BulletClassificationResult, type BulletRewriteRequest, type BulletRewriteResult, type FitExplanationRequest, type FitExplanationResult, type JdNormalized, type JdRawInput } from "./schemas/index.js";
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
export declare class VendorLLMClient implements LLMClient {
    readonly kind: "vendor";
    readonly name: string;
    private readonly provider;
    private readonly endpointUrl;
    private readonly apiKey;
    private readonly model;
    private readonly timeoutMs;
    private readonly extraHeaders;
    constructor(opts: VendorLLMClientOptions);
    private headers;
    normalizeJD(input: JdRawInput): Promise<JdNormalized>;
    classifyBulletsToCompetencies(input: BulletClassificationRequest): Promise<BulletClassificationResult>;
    suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult>;
    explainFit(input: FitExplanationRequest): Promise<FitExplanationResult>;
}
//# sourceMappingURL=VendorLLMClient.d.ts.map