import type { BulletClassificationRequest, FitExplanationRequest, FitExplanationResult } from "./schemas/index.js";

export function classifyBulletsPrompt(input: BulletClassificationRequest): string {
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

export function explainFitPrompt(input: FitExplanationRequest): string {
  return [
    "Task: explain how well the resume matches the normalized job description.",
    "Reply with ONE JSON object only (no markdown fences, no prose). Output format=json: obey strictly.",
    "Required keys: fitScore (number 0-100), tier (exactly one of: strong_fit, borderline, not_a_fit),",
    "mustHaveCoverage and niceToHaveCoverage (numbers from 0 to 1),",
    "coverage: array with one object per JD requirement: requirementId (string), covered (boolean),",
    "strength (exactly one of: explicit, implicit, weak, missing), evidence: [{ bulletId, sectionPath: string[] }], notes: string[]",
    "gaps: [ { requirementId, prompt, suggestedActions?: string[] } ], tailoredSuggestions: [ { sectionHint?, suggestion, evidence? } ].",
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

/** Coder models often wrap JSON as { fit: { ... } } or use wrong enum strings. */
function unwrapFitRoot(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const nestedKeys = ["fit", "result", "data", "explanation", "output", "response", "answer"];
  for (const k of nestedKeys) {
    const inner = o[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const io = inner as Record<string, unknown>;
      if ("fitScore" in io || "coverage" in io || "tier" in io) {
        return unwrapFitRoot(inner);
      }
    }
  }
  return raw;
}

function normalizeStrength(s: unknown): "explicit" | "implicit" | "weak" | "missing" {
  const v = String(s ?? "missing").toLowerCase().trim();
  if (v === "explicit" || v === "implicit" || v === "weak" || v === "missing") return v;
  if (v === "high" || v === "strong" || v.includes("explicit")) return "explicit";
  if (v === "medium" || v.includes("implicit")) return "implicit";
  if (v === "low" || v.includes("weak")) return "weak";
  if (v.includes("miss") || v === "none" || v === "no") return "missing";
  return "missing";
}

function normalizeTier(s: unknown): "strong_fit" | "borderline" | "not_a_fit" {
  const v = String(s ?? "borderline")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (v === "strong_fit" || v === "strongfit") return "strong_fit";
  if (v === "not_a_fit" || v === "notafit" || v === "poor_fit" || v === "no_fit") return "not_a_fit";
  if (v === "borderline" || v === "border_line" || v === "moderate") return "borderline";
  if (v === "strong" || v === "good_fit") return "strong_fit";
  return "borderline";
}

export function fallbackFitExplanationResult(
  input: FitExplanationRequest,
  raw: unknown
): FitExplanationResult {
  const unwrapped = unwrapFitRoot(raw);
  const obj = unwrapped && typeof unwrapped === "object" ? (unwrapped as Record<string, unknown>) : {};
  const fitScore = Number(obj.fitScore ?? 55);
  const tier = normalizeTier(obj.tier);

  const reqs = input.jd.requirements;
  const coverage = reqs.map((r) => ({
    requirementId: r.id,
    covered: false,
    strength: "missing" as const,
    evidence: [] as Array<{ bulletId: string; sectionPath: string[] }>,
    notes: [
      "Model output did not match the expected schema; using safe defaults. See logs for detailed errors.",
    ],
  }));

  if (coverage.length === 0) {
    coverage.push({
      requirementId: "placeholder",
      covered: false,
      strength: "missing",
      evidence: [],
      notes: ["No JD requirements in payload."],
    });
  }

  return {
    fitScore: Number.isFinite(fitScore) ? Math.max(0, Math.min(100, fitScore)) : 55,
    tier,
    mustHaveCoverage: normalizeCoverage01(obj.mustHaveCoverage ?? 0),
    niceToHaveCoverage: normalizeCoverage01(obj.niceToHaveCoverage ?? 0),
    coverage,
    gaps: [],
    tailoredSuggestions: [],
  };
}

export function normalizeFitResult(raw: unknown): unknown {
  const root = unwrapFitRoot(raw);
  if (!root || typeof root !== "object") return root;
  const obj = root as Record<string, unknown>;

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
        strength: normalizeStrength(cc.strength),
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
      const hintRaw =
        ss.sectionHint === undefined || ss.sectionHint === null ? undefined : String(ss.sectionHint).trim();
      return {
        sectionHint: hintRaw && hintRaw.length > 0 ? hintRaw : undefined,
        suggestion: String(ss.suggestion ?? "").trim(),
        evidence,
      };
    })
    .filter((s) => s.suggestion.length > 0);

  const fitScore = Number(obj.fitScore ?? 0);
  const safeCoverage =
    coverage.length > 0
      ? coverage
      : [
          {
            requirementId: "unknown_requirement",
            covered: false,
            strength: "missing" as const,
            evidence: [],
            notes: ["Model output lacked structured requirement coverage."],
          },
        ];

  return {
    fitScore: Number.isFinite(fitScore) ? Math.max(0, Math.min(100, fitScore)) : 0,
    tier: normalizeTier(obj.tier),
    mustHaveCoverage,
    niceToHaveCoverage,
    coverage: safeCoverage,
    gaps,
    tailoredSuggestions,
  };
}
