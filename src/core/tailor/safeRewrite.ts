import type { ResumeDocument } from "../resume/types.js";
import type { BulletRewriteVariant } from "../../llm/schemas/index.js";

const STOPWORDS = new Set(
  "a an the and or for of in on at to from with by as is are was were be been being it its this that these those not no yes all any some more most less very much can could should would will may might must have has had do does did get got go going went see seen use used using work worked working team lead led project projects experience years year month months day days strong solid deep broad hands-on end-to-end cross-functional".split(
    /\s+/
  )
);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+.#\-/\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Normalize LaTeX escape sequences for metric comparison.
 * \$16,000 → $16,000  \% → %  so extracted metrics are comparable.
 */
function normForMetrics(s: string): string {
  return s
    .replace(/\\\$/g, "$")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .toLowerCase();
}
/**
 * Extract all number-like tokens from text: percentages, dollar amounts, plain numbers.
 * These must ALL be preserved in the rewrite.
 * Works with both plain text and LaTeX-escaped text (\$, \%).
 */
function extractMetrics(text: string): string[] {
  const norm = normForMetrics(text);
  const metrics: string[] = [];
  const matches = norm.match(/\$?[\d,]+\.?\d*[kKmMbB%+]?(?:\+)?|\d+\s*\+?\s*(?:hour|hr|day|year|month|week)s?/gi);
  if (matches) metrics.push(...matches.map(m => m.toLowerCase().replace(/,/g, "")));
  return metrics;
}

/**
 * Vocabulary allowed in rewritten bullets: entire resume corpus + JD keywords.
 * JD keywords are included so domain-specific role requirements (e.g. "equities",
 * "fixed income", "securities") are allowed when aligning bullets to a JD.
 * Prevents introducing obviously fabricated skills not in either document.
 */
export function buildResumeVocabularyCorpus(
  resume: ResumeDocument,
  jdText?: string
): Set<string> {
  const corpus = new Set<string>();
  for (const t of tokenize(resume.rawText)) corpus.add(t);
  for (const b of resume.bullets) for (const t of tokenize(b.text)) corpus.add(t);
  for (const w of STOPWORDS) corpus.add(w);
  // Add JD vocabulary so JD-aligned rewrites aren't rejected for domain terms
  if (jdText) {
    for (const t of tokenize(jdText)) corpus.add(t);
  }
  return corpus;
}

export function unknownTokenRatio(text: string, corpus: Set<string>): number {
  const toks = tokenize(text);
  if (toks.length === 0) return 0;
  let unknown = 0;
  for (const t of toks) {
    if (t.length < 3) continue;
    if (corpus.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    unknown += 1;
  }
  return unknown / toks.length;
}

/**
 * Verify that the rewritten bullet preserves ALL numeric metrics from the original.
 * Returns null if OK, or a rejection reason string.
 */
function checkMetricsPreserved(original: string, rewritten: string): string | null {
  const origMetrics = extractMetrics(original);
  if (origMetrics.length === 0) return null; // no metrics to check

  // Normalize both for comparison (strip LaTeX escapes like \$ \%)
  const rewrittenNorm = normForMetrics(rewritten).replace(/,/g, "");
  const missing: string[] = [];
  for (const metric of origMetrics) {
    const stripped = metric.replace(/,/g, "");
    if (!rewrittenNorm.includes(stripped)) {
      missing.push(metric);
    }
  }
  if (missing.length > 0) {
    return `Removed metrics from original: ${missing.join(", ")}`;
  }
  return null;
}

/**
 * Verify the rewrite isn't significantly shorter than the original (which indicates
 * content was dropped).
 */
function checkLengthPreserved(original: string, rewritten: string): string | null {
  const origWords = original.trim().split(/\s+/).length;
  const rewriteWords = rewritten.trim().split(/\s+/).length;
  // Allow up to 20% shorter (small decrease can be OK), flag big drops
  if (rewriteWords < origWords * 0.75) {
    return `Rewrite too short (${rewriteWords} words vs original ${origWords} words — possible content loss)`;
  }
  return null;
}

export interface SafeVariantResult {
  accepted: BulletRewriteVariant[];
  rejected: Array<{ variant: BulletRewriteVariant; reason: string }>;
}

// Generous threshold: allow up to 60% new tokens (JD vocab is already in corpus)
const DEFAULT_MAX_UNKNOWN_RATIO = 0.60;

/**
 * Keep only variants whose bulletId exists and whose text:
 * 1. Does not introduce too many tokens absent from the combined resume+JD corpus.
 * 2. Preserves all numeric metrics from the original bullet.
 * 3. Is not significantly shorter than the original (no content drop).
 */
export function filterSafeBulletVariants(
  resume: ResumeDocument,
  variants: BulletRewriteVariant[],
  jdText?: string,
  maxUnknownRatio = DEFAULT_MAX_UNKNOWN_RATIO
): SafeVariantResult {
  const ids = new Set(resume.bullets.map((b) => b.bulletId));
  const corpus = buildResumeVocabularyCorpus(resume, jdText);
  // Use rawLatex as the comparison baseline since the LLM now receives rawLatex
  const bulletTextById = new Map(resume.bullets.map((b) => [b.bulletId, b.rawLatex ?? b.text]));
  const accepted: BulletRewriteVariant[] = [];
  const rejected: Array<{ variant: BulletRewriteVariant; reason: string }> = [];

  for (const v of variants) {
    if (!ids.has(v.bulletId)) {
      rejected.push({ variant: v, reason: `Unknown bulletId: ${v.bulletId}` });
      continue;
    }

    const original = bulletTextById.get(v.bulletId) ?? "";

    // Unchanged bullet — accept as-is
    if (v.text.trim() === original.trim()) {
      accepted.push(v);
      continue;
    }

    // Check unknown token ratio
    const ratio = unknownTokenRatio(v.text, corpus);
    if (ratio > maxUnknownRatio) {
      rejected.push({
        variant: v,
        reason: `Too many out-of-corpus tokens (ratio ${ratio.toFixed(3)} > ${maxUnknownRatio})`,
      });
      continue;
    }

    // Check that all numeric metrics are preserved
    const metricsError = checkMetricsPreserved(original, v.text);
    if (metricsError) {
      rejected.push({ variant: v, reason: metricsError });
      continue;
    }

    // Check bullet wasn't drastically shortened (content loss)
    const lengthError = checkLengthPreserved(original, v.text);
    if (lengthError) {
      rejected.push({ variant: v, reason: lengthError });
      continue;
    }

    accepted.push(v);
  }
  return { accepted, rejected };
}
