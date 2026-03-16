import { BulletClassificationResultSchema, BulletRewriteResultSchema, FitExplanationResultSchema, JdNormalizedSchema, } from "./schemas/index.js";
import { postJson } from "./http.js";
import { parseWithSchema } from "./validate.js";
export class LocalLLMClient {
    kind = "local";
    name;
    endpointUrl;
    model;
    headers;
    timeoutMs;
    constructor(opts) {
        this.endpointUrl = opts.endpointUrl;
        this.model = opts.model;
        this.headers = opts.headers ?? {};
        this.timeoutMs = opts.timeoutMs ?? 90_000;
        this.name = `LocalLLM(${this.model ?? "default"})`;
    }
    async normalizeJD(input) {
        const req = { task: "normalize_jd", input, model: this.model };
        const res = await postJson(this.endpointUrl, req, this.headers, this.timeoutMs);
        return parseWithSchema(JdNormalizedSchema, res.output, "normalizeJD");
    }
    async classifyBulletsToCompetencies(input) {
        const req = {
            task: "classify_bullets_to_competencies",
            input,
            model: this.model,
        };
        const res = await postJson(this.endpointUrl, req, this.headers, this.timeoutMs);
        return parseWithSchema(BulletClassificationResultSchema, res.output, "classifyBulletsToCompetencies");
    }
    async suggestBulletRewrites(input) {
        const req = { task: "suggest_bullet_rewrites", input, model: this.model };
        const res = await postJson(this.endpointUrl, req, this.headers, this.timeoutMs);
        return parseWithSchema(BulletRewriteResultSchema, res.output, "suggestBulletRewrites");
    }
    async explainFit(input) {
        const req = { task: "explain_fit", input, model: this.model };
        const res = await postJson(this.endpointUrl, req, this.headers, this.timeoutMs);
        return parseWithSchema(FitExplanationResultSchema, res.output, "explainFit");
    }
}
//# sourceMappingURL=LocalLLMClient.js.map