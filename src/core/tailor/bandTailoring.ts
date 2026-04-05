import type { DecisionBand } from "../policy/scoringPolicy.js";
import type { FitExplanationResult } from "../../llm/schemas/index.js";

export interface DecisionTraceRowLike {
  finalDecision: "covered" | "gap";
  semantic: { bestBulletId: string | null };
}

/**
 * Scope narrative suggestions and rewrite budget by decision band.
 * For all bands we allow aggressive rewrites — the ATS Engine's job is to
 * maximally align the resume to the JD without fabricating content.
 */
export function tailoredSuggestionsForBand(
  band: DecisionBand,
  fit: FitExplanationResult
): {
  band: DecisionBand;
  narrativeSuggestions: FitExplanationResult["tailoredSuggestions"];
  maxBulletsToRewrite: number;
  tone: string;
} {
  const all = fit.tailoredSuggestions ?? [];
  switch (band) {
    case "apply_strong":
      return {
        band,
        narrativeSuggestions: all.slice(0, 6),
        maxBulletsToRewrite: 8,
        tone: "keyword_alignment_and_impact_amplification",
      };
    case "apply_borderline":
      return {
        band,
        narrativeSuggestions: all.slice(0, 12),
        maxBulletsToRewrite: 12,
        tone: "emphasize_evidence_for_gaps_and_align_keywords",
      };
    case "skip":
    default:
      return {
        band,
        narrativeSuggestions: all.slice(0, 20),
        // Even for skip band: rewrite ALL bullets to maximise score improvement
        maxBulletsToRewrite: 20,
        tone: "aggressive_keyword_alignment_to_maximize_jd_fit",
      };
  }
}

/**
 * Pick bullet IDs to rewrite: gap rows with a semantic anchor bullet, deduped, capped.
 */
export function selectBulletsForRewrite(
  trace: DecisionTraceRowLike[],
  maxBullets: number,
  allBulletIds: string[] = [],
  suggestedIds: string[] = []
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  // 1. Semantic anchor bullets corresponding to gaps (highest priority)
  for (const row of trace) {
    if (row.finalDecision === "gap") {
      add(row.semantic.bestBulletId);
    }
    if (out.length >= maxBullets) return out;
  }

  // 2. Explicitly suggested bullet IDs from LLM fit analysis
  for (const id of suggestedIds) {
    add(id);
    if (out.length >= maxBullets) return out;
  }

  // 3. Covered bullets (can be strengthened with better keywords)
  for (const row of trace) {
    if (row.finalDecision === "covered") {
      add(row.semantic.bestBulletId);
    }
    if (out.length >= maxBullets) return out;
  }

  // 4. Fill remaining budget with all bullets sequentially
  for (const id of allBulletIds) {
    add(id);
    if (out.length >= maxBullets) return out;
  }

  return out;
}
