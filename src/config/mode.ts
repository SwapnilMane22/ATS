import type { LLMClient } from "../llm/LLMClient.js";
import { FallbackLLMClient } from "../llm/FallbackLLMClient.js";
import { OllamaLLMClient } from "../llm/OllamaLLMClient.js";
import { PortfolioLLMClient } from "../llm/PortfolioLLMClient.js";

export type AtsMode = "local" | "portfolio";

export interface AtsEngineConfig {
  mode: AtsMode;
  localModel?: string | undefined;
}

export function loadConfigFromEnv(): AtsEngineConfig {
  const mode = (process.env.ATS_MODE ?? "local") as AtsMode;
  const localModel = process.env.ATS_LOCAL_MODEL;

  return {
    mode,
    localModel,
  };
}

export function createLLMClientFromConfig(cfg: AtsEngineConfig): LLMClient {
  if (cfg.mode === "portfolio") {
    return new PortfolioLLMClient();
  }

  const primaryLocalClient = new OllamaLLMClient({
    model: cfg.localModel ?? "qwen2.5-coder:7b",
  });

  const fallbackEnabled =
    (process.env.ATS_LOCAL_FALLBACK_PORTFOLIO ?? "1") !== "0" &&
    (process.env.ATS_LOCAL_FALLBACK_PORTFOLIO ?? "1") !== "false";
  const hasPortfolioKeys =
    Boolean(process.env.OPENROUTER_API_KEY) || Boolean(process.env.GEMINI_API_KEY);
  if (fallbackEnabled && hasPortfolioKeys) {
    return new FallbackLLMClient(primaryLocalClient, new PortfolioLLMClient());
  }

  return primaryLocalClient;
}

