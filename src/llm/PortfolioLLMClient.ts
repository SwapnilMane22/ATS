import { createRequire } from "node:module";
import { AbstractLLMClient } from "./AbstractLLMClient.js";
import { extractJsonValue } from "./extractJson.js";

const require = createRequire(import.meta.url);
const { chatCompletion, chatCompletionGemini } =
  require("portfolio-backend/llm") as typeof import("portfolio-backend/llm");

export type PortfolioLLMClientKind = "portfolio";

function parseCommaList(value: string | undefined, fallback: string): string[] {
  const raw = (value ?? fallback).toString();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveGeminiModelList(): string[] {
  const modelsEnv =
    process.env.GEMINI_MODELS ||
    process.env.GEMINI_MODEL ||
    "gemini-3-flash-preview";
  return parseCommaList(modelsEnv, "gemini-3-flash-preview");
}

function resolveOpenRouterModelList(): string[] {
  const modelsEnv =
    process.env.CHAT_MODELS ||
    process.env.CHAT_MODEL ||
    "google/gemma-2-9b-it:free";
  return parseCommaList(modelsEnv, "google/gemma-2-9b-it:free");
}

function openRouterJsonModeEnabled(): boolean {
  const v = process.env.ATS_OPENROUTER_JSON_MODE;
  return v !== "0" && v !== "false";
}

function geminiJsonModeEnabled(): boolean {
  const v = process.env.ATS_GEMINI_JSON_MODE;
  return v !== "0" && v !== "false";
}

export class PortfolioLLMClient extends AbstractLLMClient {
  readonly kind = "portfolio" as const;
  readonly name: string;

  constructor() {
    super();
    const or = process.env.OPENROUTER_API_KEY ? "openrouter" : "";
    const gm = process.env.GEMINI_API_KEY ? "gemini" : "";
    this.name = `PortfolioLLM(${[or, gm].filter(Boolean).join("+") || "unconfigured"})`;
  }

  protected async completeJson(system: string, user: string): Promise<unknown> {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const baseURL = process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api/v1";
    const modelList = resolveOpenRouterModelList();
    const geminiModelList = resolveGeminiModelList();
    const maxTokens = Number(process.env.ATS_MAX_TOKENS ?? "16384");
    const temperature = Number(process.env.ATS_TEMPERATURE ?? "0.2");
    const useOrJson = openRouterJsonModeEnabled();
    const useGeminiJson = geminiJsonModeEnabled();

    const messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    const debug = process.env.ATS_DEBUG_LLM === "1" || process.env.ATS_DEBUG_LLM === "true";

    if (openRouterKey && modelList.length > 0) {
      let lastErr: unknown;
      for (const m of modelList) {
        const orAttempts: Array<{ responseFormatJson?: boolean }> = useOrJson
          ? [{ responseFormatJson: true }, {}]
          : [{}];
        let modelAttemptErr: unknown;
        for (const orExtra of orAttempts) {
          try {
            if (debug) {
              console.error(
                `[ATS LLM] OpenRouter model=${m} responseFormatJson=${orExtra.responseFormatJson ?? false}`
              );
            }
            const text = await chatCompletion(messages, openRouterKey, baseURL, m, {
              maxTokens,
              temperature,
              ...orExtra,
            });
            const parsed = extractJsonValue(text);
            if (debug) {
              console.error(`[ATS LLM] OpenRouter parsed JSON ok model=${m}`);
            }
            return parsed;
          } catch (e) {
            modelAttemptErr = e;
            if (debug) {
              console.error(
                `[ATS LLM] OpenRouter attempt fail model=${m}:`,
                e instanceof Error ? e.message : e
              );
            }
          }
        }
        lastErr = modelAttemptErr;
      }
      if (!geminiKey) {
        throw lastErr instanceof Error
          ? lastErr
          : new Error("All OpenRouter models failed for ATS task");
      }
      if (debug) {
        console.error("[ATS LLM] Falling back to Gemini after OpenRouter failures");
      }
    }

    if (geminiKey) {
      let lastErr: unknown;
      for (const gm of geminiModelList) {
        const geminiAttempts: Array<{ responseMimeType?: "application/json" }> = useGeminiJson
          ? [{ responseMimeType: "application/json" }, {}]
          : [{}];
        let modelAttemptErr: unknown;
        for (const extra of geminiAttempts) {
          try {
            if (debug) {
              console.error(
                `[ATS LLM] Gemini model=${gm} responseMimeType=${extra.responseMimeType ?? "(none)"}`
              );
            }
            const text = await chatCompletionGemini(messages, geminiKey, gm, {
              maxTokens,
              temperature,
              ...extra,
            });
            const parsed = extractJsonValue(text);
            if (debug) {
              console.error(`[ATS LLM] Gemini parsed JSON ok model=${gm}`);
            }
            return parsed;
          } catch (e) {
            modelAttemptErr = e;
            if (debug) {
              console.error(
                `[ATS LLM] Gemini attempt fail model=${gm}:`,
                e instanceof Error ? e.message : e
              );
            }
          }
        }
        lastErr = modelAttemptErr;
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error("All Gemini models failed for ATS task");
    }

    throw new Error(
      "Portfolio LLM mode requires OPENROUTER_API_KEY and/or GEMINI_API_KEY (same env vars as portfolio backend)."
    );
  }
}
