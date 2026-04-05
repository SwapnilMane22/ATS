import { FallbackLLMClient } from "../llm/FallbackLLMClient.js";
import { OllamaLLMClient } from "../llm/OllamaLLMClient.js";
import { PortfolioLLMClient } from "../llm/PortfolioLLMClient.js";
/** Default when `ATS_LOCAL_MODEL` is unset — Gemma 4 26B MoE via Ollama (`ollama pull gemma4:26b`). */
export const DEFAULT_LOCAL_OLLAMA_MODEL = "gemma4:26b";
export function loadConfigFromEnv() {
    const mode = (process.env.ATS_MODE ?? "local");
    const localModel = process.env.ATS_LOCAL_MODEL;
    return {
        mode,
        localModel,
    };
}
export function createLLMClientFromConfig(cfg) {
    if (cfg.mode === "portfolio") {
        return new PortfolioLLMClient();
    }
    const primaryLocalClient = new OllamaLLMClient({
        model: cfg.localModel ?? DEFAULT_LOCAL_OLLAMA_MODEL,
    });
    const fallbackEnabled = (process.env.ATS_LOCAL_FALLBACK_PORTFOLIO ?? "1") !== "0" &&
        (process.env.ATS_LOCAL_FALLBACK_PORTFOLIO ?? "1") !== "false";
    const hasPortfolioKeys = Boolean(process.env.OPENROUTER_API_KEY) || Boolean(process.env.GEMINI_API_KEY);
    if (fallbackEnabled && hasPortfolioKeys) {
        return new FallbackLLMClient(primaryLocalClient, new PortfolioLLMClient());
    }
    return primaryLocalClient;
}
//# sourceMappingURL=mode.js.map