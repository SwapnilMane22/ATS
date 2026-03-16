import type { LLMClient } from "./LLMClient.js";
import { type BulletClassificationRequest, type BulletClassificationResult, type BulletRewriteRequest, type BulletRewriteResult, type FitExplanationRequest, type FitExplanationResult, type JdNormalized, type JdRawInput } from "./schemas/index.js";
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
export declare class LocalLLMClient implements LLMClient {
    readonly kind: "local";
    readonly name: string;
    private readonly endpointUrl;
    private readonly model;
    private readonly headers;
    private readonly timeoutMs;
    constructor(opts: LocalLLMClientOptions);
    normalizeJD(input: JdRawInput): Promise<JdNormalized>;
    classifyBulletsToCompetencies(input: BulletClassificationRequest): Promise<BulletClassificationResult>;
    suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult>;
    explainFit(input: FitExplanationRequest): Promise<FitExplanationResult>;
}
//# sourceMappingURL=LocalLLMClient.d.ts.map