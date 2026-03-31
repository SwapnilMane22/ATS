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
import { postJson } from "./http.js";
import { extractJsonValue } from "./extractJson.js";

interface OllamaChatResponse {
  message?: { content?: string };
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

export interface OllamaLLMClientOptions {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}

const SYSTEM_JSON_ONLY =
  "You are a precise assistant for resume and job-description analysis. " +
  "Respond with ONLY valid JSON. No markdown code fences, no commentary before or after the JSON.";

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

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter((s) => s.trim().length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|;/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeCoverage01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return Math.max(0, Math.min(1, v / 100));
  return Math.max(0, Math.min(1, v));
}

function normalizeFitResult(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;

  const mustHaveCoverage = normalizeCoverage01(obj.mustHaveCoverage);
  const niceToHaveCoverage = normalizeCoverage01(obj.niceToHaveCoverage);

  const coverageIn = Array.isArray(obj.coverage) ? obj.coverage : [];
  const coverage = coverageIn
    .map((c) => {
    const cc = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const evidenceIn = Array.isArray(cc.evidence) ? cc.evidence : [];
    const evidence = evidenceIn
      .map((e) => {
        const ee = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
        return {
          bulletId: String(ee.bulletId ?? ""),
          sectionPath: coerceStringArray(ee.sectionPath),
        };
      })
      .filter((e) => e.bulletId.length > 0);
    return {
      requirementId: String(cc.requirementId ?? ""),
      covered: Boolean(cc.covered),
      strength: String(cc.strength ?? "missing"),
      evidence,
      notes: coerceStringArray(cc.notes),
    };
    })
    .filter((c) => c.requirementId.trim().length > 0);

  const gapsIn = Array.isArray(obj.gaps) ? obj.gaps : [];
  const gaps = gapsIn
    .map((g) => {
      const gg = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
      return {
        requirementId: String(gg.requirementId ?? "").trim(),
        prompt: String(gg.prompt ?? "").trim(),
        suggestedActions: coerceStringArray(gg.suggestedActions),
      };
    })
    .filter((g) => g.requirementId.length > 0 && g.prompt.length > 0);

  const suggIn = Array.isArray(obj.tailoredSuggestions) ? obj.tailoredSuggestions : [];
  const tailoredSuggestions = suggIn
    .map((s) => {
      const ss = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const evidenceIn = Array.isArray(ss.evidence) ? ss.evidence : [];
      const evidence = evidenceIn
        .map((e) => {
          const ee = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
          return {
            bulletId: String(ee.bulletId ?? ""),
            sectionPath: coerceStringArray(ee.sectionPath),
          };
        })
        .filter((e) => e.bulletId.length > 0);
      return {
        sectionHint:
          ss.sectionHint === undefined || ss.sectionHint === null
            ? undefined
            : String(ss.sectionHint).trim(),
        suggestion: String(ss.suggestion ?? "").trim(),
        evidence,
      };
    })
    .filter((s) => s.suggestion.length > 0);

  const fitScore = Number(obj.fitScore ?? 0);
  const tier = String(obj.tier ?? "borderline");
  const validTier = tier === "strong_fit" || tier === "borderline" || tier === "not_a_fit";
  const safeCoverage = coverage.length > 0 ? coverage : [{ requirementId: "unknown_requirement", covered: false, strength: "missing", evidence: [], notes: ["Model output lacked structured requirement coverage."] }];

  return {
    fitScore: Number.isFinite(fitScore) ? Math.max(0, Math.min(100, fitScore)) : 0,
    tier: validTier ? tier : "borderline",
    mustHaveCoverage,
    niceToHaveCoverage,
    coverage: safeCoverage,
    gaps,
    tailoredSuggestions,
  };
}

export class OllamaLLMClient implements LLMClient {
  readonly kind = "local" as const;
  readonly name: string;

  private readonly url: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: OllamaLLMClientOptions) {
    const base = (opts.baseUrl ?? process.env.ATS_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(
      /\/$/,
      ""
    );
    this.baseUrl = base;
    this.url = `${base}/api/chat`;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.ATS_OLLAMA_TIMEOUT_MS ?? "300000");
    this.name = `OllamaLLM(${this.model})`;
  }

  private fallbackModelsFromEnv(): string[] {
    const raw = process.env.ATS_OLLAMA_FALLBACK_MODELS;
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async resolveModelCandidates(): Promise<string[]> {
    const ordered = [this.model, ...this.fallbackModelsFromEnv()];
    const unique = [...new Set(ordered)];
    if (unique.length <= 1) return unique;
    try {
      const tagsRes = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      if (!tagsRes.ok) return unique;
      const tags = (await tagsRes.json()) as OllamaTagsResponse;
      const installed = new Set((tags.models ?? []).map((m) => m.name).filter(Boolean) as string[]);
      const installedPreferred = unique.filter((m) => installed.has(m));
      if (installedPreferred.length > 0) return installedPreferred;
      return unique;
    } catch {
      return unique;
    }
  }

  private async completeJson(user: string): Promise<unknown> {
    const models = await this.resolveModelCandidates();
    let lastErr: unknown;
    for (const model of models) {
      const body = {
        model,
        stream: false,
        format: "json",
        options: {
          temperature: Number(process.env.ATS_TEMPERATURE ?? "0.2"),
        },
        messages: [
          { role: "system", content: SYSTEM_JSON_ONLY },
          { role: "user", content: user },
        ],
      };
      const timeouts = [this.timeoutMs, this.timeoutMs * 2];
      for (let attempt = 0; attempt < timeouts.length; attempt += 1) {
        try {
          const res = await postJson<OllamaChatResponse>(
            this.url,
            body,
            {},
            timeouts[attempt]!
          );
          const text = res.message?.content;
          if (!text || !text.trim()) {
            throw new Error("Ollama returned empty response content");
          }
          return extractJsonValue(text);
        } catch (e) {
          lastErr = e;
          const isAbort =
            (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message))) ||
            String(e).includes("AbortError");
          if (!(isAbort && attempt < timeouts.length - 1)) {
            break;
          }
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Ollama request failed for all candidate models");
  }

  async normalizeJD(input: JdRawInput): Promise<JdNormalized> {
    const raw = await this.completeJson(normalizeJdPrompt(input));
    return parseWithSchema(JdNormalizedSchema, raw, "normalizeJD");
  }

  async classifyBulletsToCompetencies(
    input: BulletClassificationRequest
  ): Promise<BulletClassificationResult> {
    const raw = await this.completeJson(classifyBulletsPrompt(input));
    return parseWithSchema(
      BulletClassificationResultSchema,
      raw,
      "classifyBulletsToCompetencies"
    );
  }

  async suggestBulletRewrites(input: BulletRewriteRequest): Promise<BulletRewriteResult> {
    const raw = await this.completeJson(rewriteBulletsPrompt(input));
    return parseWithSchema(BulletRewriteResultSchema, raw, "suggestBulletRewrites");
  }

  async explainFit(input: FitExplanationRequest): Promise<FitExplanationResult> {
    const raw = await this.completeJson(explainFitPrompt(input));
    return parseWithSchema(FitExplanationResultSchema, normalizeFitResult(raw), "explainFit");
  }
}
