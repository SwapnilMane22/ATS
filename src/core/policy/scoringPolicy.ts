import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface ScoringPolicy {
  version: string;
  weights: {
    deterministic: number;
    semantic: number;
    llmFit: number;
  };
  thresholds: {
    mustHaveCoverageMin: number;
    semanticSimilarityMin: number;
  };
  decisionBands: {
    apply_strong: { scoreMin: number; confidenceMin: number; mustHaveMin: number };
    apply_borderline: { scoreMin: number; scoreMax: number };
    skip: { scoreMax: number };
  };
}

export interface PolicyMetadata {
  policy: ScoringPolicy;
  policyPath: string;
  policySha256: string;
}

const DEFAULT_POLICY_PATH = path.resolve("config/scoring-policy.v1.json");

export async function loadScoringPolicy(): Promise<PolicyMetadata> {
  const policyPath = process.env.ATS_SCORING_POLICY_PATH
    ? path.resolve(process.env.ATS_SCORING_POLICY_PATH)
    : DEFAULT_POLICY_PATH;
  const raw = await fs.readFile(policyPath, "utf8");
  const policy = JSON.parse(raw) as ScoringPolicy;
  const policySha256 = crypto.createHash("sha256").update(raw).digest("hex");
  return { policy, policyPath, policySha256 };
}

export type DecisionBand = "apply_strong" | "apply_borderline" | "skip";

export function deriveDecisionBand(
  policy: ScoringPolicy,
  finalScore: number,
  confidence: number,
  mustHaveCoverage: number
): DecisionBand {
  const strong = policy.decisionBands.apply_strong;
  if (
    finalScore >= strong.scoreMin &&
    confidence >= strong.confidenceMin &&
    mustHaveCoverage >= strong.mustHaveMin
  ) {
    return "apply_strong";
  }
  const border = policy.decisionBands.apply_borderline;
  if (finalScore >= border.scoreMin && finalScore <= border.scoreMax) {
    return "apply_borderline";
  }
  return "skip";
}
