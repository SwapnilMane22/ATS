import type { LLMClient } from "../llm/LLMClient.js";
export type AtsMode = "local" | "portfolio";
/** Default when `ATS_LOCAL_MODEL` is unset — Gemma 4 26B MoE via Ollama (`ollama pull gemma4:26b`). */
export declare const DEFAULT_LOCAL_OLLAMA_MODEL = "gemma4:26b";
export interface AtsEngineConfig {
    mode: AtsMode;
    localModel?: string | undefined;
}
export declare function loadConfigFromEnv(): AtsEngineConfig;
export declare function createLLMClientFromConfig(cfg: AtsEngineConfig): LLMClient;
//# sourceMappingURL=mode.d.ts.map