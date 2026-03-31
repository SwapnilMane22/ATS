import { createRequire } from "node:module";
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
import { parseWithSchema } from "./validate.js";
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

/**
 * Same model lists as portfolio `server.js` (comma-separated): try each id in order.
 * No extra model IDs are appended — that avoids 404s from hard-coded fallbacks that differ by API version/region.
 */
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

const SYSTEM_JSON_ONLY =
  "You are a precise assistant for resume and job-description analysis. " +
  "Respond with ONLY valid JSON. No markdown code fences, no commentary before or after the JSON.";

function openRouterJsonModeEnabled(): boolean {
  const v = process.env.ATS_OPENROUTER_JSON_MODE;
  return v !== "0" && v !== "false";
}

function geminiJsonModeEnabled(): boolean {
  const v = process.env.ATS_GEMINI_JSON_MODE;
  return v !== "0" && v !== "false";
}

function normalizeJdPrompt(input: JdRawInput): string {
  return [
    "Task: normalize the job description into structured JSON.",
    "Ignore logistic/non-skill details such as location, employment type, location type, department label, compensation/salary/equity, and visa/sponsorship details.",
    "Required top-level keys: summary, requirements, mustHaveIds, niceToHaveIds, responsibilityIds, inferredRoleTitles, senioritySignals.",
    "Each requirement: { id, text, kind: must_have | nice_to_have | responsibility, category: hard_skill | soft_skill | domain | seniority | education | other, signals: string[] }.",
    "mustHaveIds / niceToHaveIds / responsibilityIds must list requirement ids; align with each requirement's kind.",
    "Return JSON only.",
    "",
    "INPUT:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

function classifyBulletsPrompt(input: BulletClassificationRequest): string {
  return [
    "Task: classify each resume bullet into roles and competencies from the provided catalogs.",
    "Output JSON shape:",
    '{ "bulletLabels": [ { "bulletId", "inferredRoles": [{ "roleId", "confidence" 0-1, "rationale" optional }], "inferredCompetencies": [{ "competencyId", "confidence", "rationale" optional }], "senioritySignals": [] } ], "inferredPrimaryRoles": [{ "roleId", "confidence" }] }',
    "Use ONLY roleId values from knownRoles and competencyId values from knownCompetencies.",
    "Include one bulletLabels entry per input bullet (same bulletId).",
    "",
    "INPUT:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

function rewriteBulletsPrompt(input: BulletRewriteRequest): string {
  return [
    "Task: suggest improved resume bullet text variants.",
    "Respect constraints.forbidFabrication: do not invent employers, dates, or metrics; metric placeholders are allowed only if constraints.allowMetricPlaceholders is true.",
    "Output JSON: { variants: [ { bulletId, variantId, text, notes?, usedPlaceholders? } ] } with at least one variant per bullet.",
    "",
    "INPUT:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

function explainFitPrompt(input: FitExplanationRequest): string {
  return [
    "Task: explain how well the resume matches the normalized job description.",
    "Output JSON with: fitScore (0-100), tier: strong_fit | borderline | not_a_fit, mustHaveCoverage, niceToHaveCoverage (0-1),",
    "coverage: [ { requirementId, covered, strength: explicit|implicit|weak|missing, evidence: [{ bulletId, sectionPath }], notes? } ] (one per JD requirement),",
    "gaps: [ { requirementId, prompt, suggestedActions? } ], tailoredSuggestions: [ { sectionHint?, suggestion, evidence? } ].",
    "",
    "INPUT:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

/**
 * Uses the same OpenRouter + Gemini HTTP clients as the portfolio backend (`portfolio-backend/llm`).
 * Provider order matches portfolio chat: try OpenRouter model list first, then Gemini.
 */
export class PortfolioLLMClient implements LLMClient {
  readonly kind = "portfolio" as const;
  readonly name: string;

  constructor() {
    const or = process.env.OPENROUTER_API_KEY ? "openrouter" : "";
    const gm = process.env.GEMINI_API_KEY ? "gemini" : "";
    this.name = `PortfolioLLM(${[or, gm].filter(Boolean).join("+") || "unconfigured"})`;
  }

  private async completeJson(system: string, user: string): Promise<unknown> {
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

    // Same order as portfolio chat: try every OpenRouter model in CHAT_MODELS, then every Gemini model in GEMINI_MODELS.
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

  async normalizeJD(input: JdRawInput): Promise<JdNormalized> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, normalizeJdPrompt(input));
    return parseWithSchema(JdNormalizedSchema, raw, "normalizeJD");
  }

  async classifyBulletsToCompetencies(
    input: BulletClassificationRequest
  ): Promise<BulletClassificationResult> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, classifyBulletsPrompt(input));
    return parseWithSchema(
      BulletClassificationResultSchema,
      raw,
      "classifyBulletsToCompetencies"
    );
  }

  async suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, rewriteBulletsPrompt(input));
    return parseWithSchema(BulletRewriteResultSchema, raw, "suggestBulletRewrites");
  }

  async explainFit(input: FitExplanationRequest): Promise<FitExplanationResult> {
    const raw = await this.completeJson(SYSTEM_JSON_ONLY, explainFitPrompt(input));
    return parseWithSchema(FitExplanationResultSchema, raw, "explainFit");
  }
}
