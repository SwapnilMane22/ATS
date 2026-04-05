import type { BulletRewriteRequest, BulletRewriteResult } from "./schemas/index.js";

export function unwrapBulletRewriteRoot(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  if (
    Array.isArray(o.variants) ||
    Array.isArray(o.bulletRewrites) ||
    Array.isArray(o.rewrites)
  ) {
    return raw;
  }
  for (const k of ["result", "data", "output", "response", "answer"]) {
    const inner = o[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return unwrapBulletRewriteRoot(inner);
    }
  }
  return raw;
}

function coerceNotes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((n) => String(n).trim()).filter((s) => s.length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function coerceBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/**
 * Coerce LLM output toward `BulletRewriteResult` before zod.
 */
export function normalizeBulletRewriteResult(
  raw: unknown,
  input: BulletRewriteRequest
): unknown {
  const root = unwrapBulletRewriteRoot(raw);
  if (!root || typeof root !== "object") {
    return fallbackBulletRewriteResult(input);
  }
  const obj = root as Record<string, unknown>;
  let variantsIn: unknown = obj.variants ?? obj.bulletRewrites ?? obj.rewrites;
  if (!Array.isArray(variantsIn) && variantsIn && typeof variantsIn === "object") {
    variantsIn = Object.values(variantsIn as Record<string, unknown>);
  }
  if (!Array.isArray(variantsIn)) {
    variantsIn = [];
  }

  const inputIds = new Set(input.bullets.map((b) => b.bulletId));
  const byBullet = new Map<
    string,
    {
      bulletId: string;
      variantId: string;
      text: string;
      notes: string[];
      usedPlaceholders: boolean;
    }
  >();

  (variantsIn as unknown[]).forEach((v, i) => {
    const vv = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const bulletId = String(vv.bulletId ?? vv.bullet_id ?? "").trim();
    if (!bulletId || !inputIds.has(bulletId)) return;
    const variantId = String(vv.variantId ?? vv.variant_id ?? vv.id ?? `v${i + 1}`).trim() || `v${i + 1}`;
    const text = String(vv.text ?? vv.rewrittenText ?? vv.content ?? vv.body ?? "").trim();
    if (!text) return;
    const notes = coerceNotes(vv.notes);
    const usedPlaceholders = coerceBool(vv.usedPlaceholders ?? vv.used_placeholders);

    if (!byBullet.has(bulletId)) {
      byBullet.set(bulletId, {
        bulletId,
        variantId,
        text,
        notes,
        usedPlaceholders,
      });
    }
  });

  const variants: Array<{
    bulletId: string;
    variantId: string;
    text: string;
    notes: string[];
    usedPlaceholders: boolean;
  }> = [];

  for (const b of input.bullets) {
    const got = byBullet.get(b.bulletId);
    if (got) {
      variants.push(got);
    } else {
      variants.push({
        bulletId: b.bulletId,
        variantId: "v_fallback",
        text: b.text,
        notes: ["Model omitted this bullet; using original text."],
        usedPlaceholders: false,
      });
    }
  }

  return { variants };
}

export function fallbackBulletRewriteResult(input: BulletRewriteRequest): BulletRewriteResult {
  return {
    variants: input.bullets.map((b, i) => ({
      bulletId: b.bulletId,
      variantId: `v${i + 1}`,
      text: b.text,
      notes: [],
      usedPlaceholders: false,
    })),
  };
}

export function rewriteBulletsUserPrompt(input: BulletRewriteRequest & { jdContext?: string }): string {
  const jdSection = input.jdContext
    ? [
        "",
        "TARGET JOB DESCRIPTION (align bullet vocabulary to this role):",
        "---",
        input.jdContext.slice(0, 3000),
        "---",
      ]
    : [];

  return [
    "You are a resume tailoring expert. Your task is to improve resume bullet points to better match a target job description.",
    "",
    "IMPORTANT — LATEX FORMAT:",
    "• The bullet text you receive is already in LaTeX format (contains \\$, \\%, \\textbf{}, etc.).",
    "• Your improved version MUST also be valid LaTeX — preserve all LaTeX escape sequences.",
    "• LaTeX escapes to preserve: \\$ for dollar signs, \\% for percent, \\& for ampersand, \\# for hash.",
    "• Do NOT add \\item, \\begin, \\end, or any structural LaTeX — only the bullet body text.",
    "• Do NOT wrap output in markdown code fences.",
    "",
    "═══ PRESERVATION RULES (highest priority) ═══",
    "1. Keep ALL numbers, percentages, and metrics EXACTLY as written.",
    "   e.g. '80\\%', '\\$16,000', '99\\%', '60\\%', '5+ hours', '18M+' must appear verbatim.",
    "2. Keep ALL technology names, tool names, company names, and product names.",
    "   e.g. 'Vertex AI', 'AutoGen', 'LSTM-DNN', 'PySpark', 'Azure ML', 'Bird.dev'.",
    "3. Do NOT shorten bullets — improved version must be same length or LONGER.",
    "4. Do NOT change dates, team sizes, scopes, or any verifiable facts.",
    "",
    "═══ IMPROVEMENT RULES ═══",
    "5. Restructure phrasing to lead with a strong action verb aligned with the JD.",
    "6. Add JD-relevant terminology naturally without inventing new claims.",
    "7. Emphasize transferable skills that directly match the job description.",
    "8. A perfect rewrite: adds JD keywords + keeps every metric + keeps LaTeX escapes intact.",
    "",
    "═══ FABRICATION RULES ═══",
    "9. NEVER invent tools, metrics, companies, achievements, or experiences.",
    "10. Using JD vocabulary to describe your EXISTING work is encouraged.",
    "",
    "RESPONSE FORMAT:",
    "Return ONE JSON object only (no markdown). Top-level key: variants (array).",
    "Each item: { bulletId: string, variantId: string, text: string (LaTeX-formatted), notes: string[], usedPlaceholders: boolean }",
    "Every input bulletId must appear exactly once in variants.",
    ...jdSection,
    "",
    "INPUT BULLETS (LaTeX-formatted):",
    JSON.stringify(input, null, 2),
  ].join("\n");
}
