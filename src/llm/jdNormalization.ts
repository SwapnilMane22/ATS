import type { JdNormalized, JdRawInput } from "./schemas/index.js";

const JD_CATEGORIES = [
  "hard_skill",
  "soft_skill",
  "domain",
  "seniority",
  "education",
  "other",
] as const;

type JdCategory = (typeof JD_CATEGORIES)[number];

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

/** Unwrap { jd: {...} } / { data: {...} } etc. from coder models. */
export function unwrapJdRoot(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const nestedKeys = [
    "jd",
    "normalizedJobDescription",
    "normalized",
    "jobDescription",
    "result",
    "data",
    "output",
    "response",
  ];
  for (const k of nestedKeys) {
    const inner = o[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const io = inner as Record<string, unknown>;
      if ("summary" in io || "requirements" in io) {
        return unwrapJdRoot(inner);
      }
    }
  }
  return raw;
}

function requirementsArrayFromUnknown(reqVal: unknown): unknown[] {
  if (Array.isArray(reqVal)) return reqVal;
  if (reqVal && typeof reqVal === "object" && !Array.isArray(reqVal)) {
    return Object.values(reqVal as Record<string, unknown>);
  }
  return [];
}

export function normalizeJdKind(k: unknown): "must_have" | "nice_to_have" | "responsibility" {
  const v = String(k ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    v === "must_have" ||
    v === "required" ||
    v === "essential" ||
    v === "mandatory" ||
    v === "musthave"
  ) {
    return "must_have";
  }
  if (
    v === "nice_to_have" ||
    v === "preferred" ||
    v === "bonus" ||
    v === "optional" ||
    v === "nicetohave"
  ) {
    return "nice_to_have";
  }
  if (v === "responsibility" || v === "responsibilities" || v === "duty" || v === "duties") {
    return "responsibility";
  }
  return "must_have";
}

export function normalizeJdCategory(c: unknown): JdCategory {
  const v = String(c ?? "other")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if ((JD_CATEGORIES as readonly string[]).includes(v)) return v as JdCategory;
  if (v.includes("hard") && v.includes("skill")) return "hard_skill";
  if (v.includes("soft") && v.includes("skill")) return "soft_skill";
  if (v.includes("domain") || v.includes("industry")) return "domain";
  if (v.includes("senior") || v.includes("level") || v.includes("lead")) return "seniority";
  if (v.includes("edu") || v.includes("degree")) return "education";
  return "other";
}

/**
 * Coerce LLM output toward `JdNormalized` before zod — fixes nested JSON, field aliases, enums, id lists.
 */
export function normalizeJdResult(raw: unknown, sourceJdText: string): unknown {
  const root = unwrapJdRoot(raw);
  if (!root || typeof root !== "object") {
    const t = sourceJdText.trim().length > 0 ? sourceJdText : "Job description.";
    return fallbackJdNormalized({ text: t });
  }
  const obj = root as Record<string, unknown>;

  let summary = String(obj.summary ?? obj.overview ?? obj.description ?? "").trim();
  const src = sourceJdText.trim();
  if (summary.length < 1) {
    summary = src.slice(0, 1200) || "Job description (summary unavailable).";
  }

  const reqIn = requirementsArrayFromUnknown(obj.requirements);
  const requirements = reqIn
    .map((r, i) => {
      const rr = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const id = String(rr.id ?? rr.requirementId ?? rr.reqId ?? `req_${i + 1}`)
        .trim()
        .replace(/\s+/g, "_");
      const text = String(rr.text ?? rr.description ?? rr.requirement ?? rr.title ?? "").trim();
      const safeId = id.length > 0 ? id : `req_${i + 1}`;
      const safeText = text.length > 0 ? text : safeId;
      return {
        id: safeId,
        text: safeText,
        kind: normalizeJdKind(rr.kind),
        category: normalizeJdCategory(rr.category),
        signals: coerceStringArray(rr.signals),
      };
    })
    .filter((r) => r.id.length > 0 && r.text.length > 0);

  const safeReqs =
    requirements.length > 0
      ? requirements
      : [
          {
            id: "req_1",
            text: summary.slice(0, 500),
            kind: "must_have" as const,
            category: "other" as const,
            signals: [] as string[],
          },
        ];

  const idSet = new Set(safeReqs.map((r) => r.id));

  function filterIds(arr: unknown): string[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x).trim())
      .filter((id) => id.length > 0 && idSet.has(id));
  }

  let mustHaveIds = filterIds(obj.mustHaveIds);
  let niceToHaveIds = filterIds(obj.niceToHaveIds);
  let responsibilityIds = filterIds(obj.responsibilityIds);

  if (mustHaveIds.length === 0 && niceToHaveIds.length === 0 && responsibilityIds.length === 0) {
    for (const r of safeReqs) {
      if (r.kind === "must_have") mustHaveIds.push(r.id);
      else if (r.kind === "nice_to_have") niceToHaveIds.push(r.id);
      else responsibilityIds.push(r.id);
    }
  }

  if (mustHaveIds.length === 0 && safeReqs.length > 0) {
    mustHaveIds = [safeReqs[0]!.id];
  }

  return {
    summary,
    requirements: safeReqs,
    mustHaveIds,
    niceToHaveIds,
    responsibilityIds,
    inferredRoleTitles: coerceStringArray(obj.inferredRoleTitles ?? obj.roleTitles),
    senioritySignals: coerceStringArray(obj.senioritySignals ?? obj.seniority),
  };
}

export function fallbackJdNormalized(input: JdRawInput): JdNormalized {
  const text = input.text.trim();
  const summary = text.slice(0, 1200) || "Job description";
  const reqId = "req_fallback_1";
  return {
    summary,
    requirements: [
      {
        id: reqId,
        text: text.slice(0, 800) || summary.slice(0, 400),
        kind: "must_have",
        category: "other",
        signals: [],
      },
    ],
    mustHaveIds: [reqId],
    niceToHaveIds: [],
    responsibilityIds: [],
    inferredRoleTitles: [],
    senioritySignals: [],
  };
}

export function normalizeJdUserPrompt(input: JdRawInput): string {
  return [
    "Task: normalize the job description into structured JSON.",
    "Reply with ONE JSON object only (no markdown fences). Ollama format=json: obey strictly.",
    "Ignore logistics: location, comp, visa, employment type, department labels.",
    "Top-level keys: summary (string, non-empty), requirements (array), mustHaveIds, niceToHaveIds, responsibilityIds, inferredRoleTitles, senioritySignals (arrays of strings).",
    "Each requirements[] item MUST have: id (string), text (string), kind (exactly: must_have | nice_to_have | responsibility),",
    "category (exactly: hard_skill | soft_skill | domain | seniority | education | other), signals (string array, can be empty).",
    "mustHaveIds / niceToHaveIds / responsibilityIds must contain only requirement ids that appear in requirements[].id.",
    "",
    "INPUT:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}
