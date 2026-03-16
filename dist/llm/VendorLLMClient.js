import { BulletClassificationResultSchema, BulletRewriteResultSchema, FitExplanationResultSchema, JdNormalizedSchema, } from "./schemas/index.js";
import { postJson } from "./http.js";
import { parseWithSchema } from "./validate.js";
/**
 * Vendor client using the same "task router" contract as LocalLLMClient.
 *
 * In practice, you run a tiny server that:
 * - receives {task,input,model}
 * - calls the chosen vendor model
 * - returns {output} as strict JSON matching our schemas
 */
export class VendorLLMClient {
    kind = "vendor";
    name;
    provider;
    endpointUrl;
    apiKey;
    model;
    timeoutMs;
    extraHeaders;
    constructor(opts) {
        this.provider = opts.provider;
        this.endpointUrl = opts.endpointUrl;
        this.apiKey = opts.apiKey;
        this.model = opts.model;
        this.timeoutMs = opts.timeoutMs ?? 90_000;
        this.extraHeaders = opts.extraHeaders ?? {};
        this.name = `VendorLLM(${this.provider}:${this.model})`;
    }
    headers() {
        // Keep it generic; your router can interpret this.
        return {
            authorization: `Bearer ${this.apiKey}`,
            "x-ats-provider": this.provider,
            ...this.extraHeaders,
        };
    }
    async normalizeJD(input) {
        const req = { task: "normalize_jd", input, model: this.model };
        const res = await postJson(this.endpointUrl, req, this.headers(), this.timeoutMs);
        return parseWithSchema(JdNormalizedSchema, res.output, "normalizeJD");
    }
    async classifyBulletsToCompetencies(input) {
        const req = {
            task: "classify_bullets_to_competencies",
            input,
            model: this.model,
        };
        const res = await postJson(this.endpointUrl, req, this.headers(), this.timeoutMs);
        return parseWithSchema(BulletClassificationResultSchema, res.output, "classifyBulletsToCompetencies");
    }
    async suggestBulletRewrites(input) {
        const req = { task: "suggest_bullet_rewrites", input, model: this.model };
        const res = await postJson(this.endpointUrl, req, this.headers(), this.timeoutMs);
        return parseWithSchema(BulletRewriteResultSchema, res.output, "suggestBulletRewrites");
    }
    async explainFit(input) {
        const req = { task: "explain_fit", input, model: this.model };
        const res = await postJson(this.endpointUrl, req, this.headers(), this.timeoutMs);
        return parseWithSchema(FitExplanationResultSchema, res.output, "explainFit");
    }
}
//# sourceMappingURL=VendorLLMClient.js.map