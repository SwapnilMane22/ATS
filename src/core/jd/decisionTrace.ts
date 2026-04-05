import type { FitExplanationResult, JdNormalized } from "../../llm/schemas/index.js";
import {
  binaryLabelFromFinalDecision,
  requirementPredictedCoverageProbability,
  summarizeCalibration,
} from "../calibration/probAndMetrics.js";

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9+/#.\-\s]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
  );
}

function overlapScore(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / Math.max(sa.size, sb.size);
}

export interface DecisionTraceRow {
  requirementPhrase: string;
  deterministic: { covered: boolean };
  semantic: {
    similarity: number;
    bestBulletId: string | null;
  };
  llm: {
    matchedRequirementId: string | null;
    coverage: "explicit" | "implicit" | "weak" | "missing" | "unknown";
  };
  finalDecision: "covered" | "gap";
  rationaleCode: string;
  predictedCoverageProbability: number;
  calibrationLabel: 0 | 1;
}

export function buildDecisionTrace(args: {
  requirementPhrases: string[];
  deterministicCovered: Set<string>;
  semanticCoverage: Array<{ requirement: string; similarity: number; bestBulletId: string | null }>;
  jd?: JdNormalized;
  fit?: FitExplanationResult;
}): DecisionTraceRow[] {
  const semanticByReq = new Map(args.semanticCoverage.map((c) => [c.requirement, c]));
  const llmByReqId = new Map((args.fit?.coverage ?? []).map((c) => [c.requirementId, c]));
  const jdReqs = args.jd?.requirements ?? [];

  return args.requirementPhrases.map((phrase) => {
    const semantic = semanticByReq.get(phrase);
    let llmCoverage: DecisionTraceRow["llm"]["coverage"] = "unknown";
    let matchedRequirementId: string | null = null;
    if (jdReqs.length > 0 && args.fit) {
      let bestReq: { id: string; text: string } | null = null;
      let best = -1;
      for (const r of jdReqs) {
        const s = overlapScore(phrase, r.text);
        if (s > best) {
          best = s;
          bestReq = { id: r.id, text: r.text };
        }
      }
      if (bestReq) {
        matchedRequirementId = bestReq.id;
        const cov = llmByReqId.get(bestReq.id);
        if (cov) llmCoverage = cov.strength;
      }
    }
    const deterministicCovered = args.deterministicCovered.has(phrase);
    const semanticSimilarity = semantic?.similarity ?? 0;
    const finalDecision =
      (deterministicCovered ? 1 : 0) +
        (semanticSimilarity >= 0.62 ? 1 : 0) +
        (llmCoverage === "explicit" || llmCoverage === "implicit" ? 1 : 0) >=
      2
        ? "covered"
        : "gap";

    const predictedCoverageProbability = requirementPredictedCoverageProbability({
      deterministicCovered,
      semanticSimilarity,
      llmStrength: llmCoverage,
    });

    return {
      requirementPhrase: phrase,
      deterministic: { covered: deterministicCovered },
      semantic: {
        similarity: Number(semanticSimilarity.toFixed(4)),
        bestBulletId: semantic?.bestBulletId ?? null,
      },
      llm: {
        matchedRequirementId,
        coverage: llmCoverage,
      },
      finalDecision,
      rationaleCode: finalDecision === "covered" ? "EVIDENCE_SUFFICIENT" : "EVIDENCE_GAP",
      predictedCoverageProbability,
      calibrationLabel: binaryLabelFromFinalDecision(finalDecision),
    };
  });
}

export function calibrationFromTrace(rows: DecisionTraceRow[]) {
  const pairs = rows.map((r) => ({
    p: r.predictedCoverageProbability,
    y: r.calibrationLabel,
  }));
  return summarizeCalibration(pairs);
}
