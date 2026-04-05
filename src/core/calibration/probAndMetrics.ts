/**
 * Per-requirement predicted coverage probability and aggregate calibration metrics.
 * Labels use the pipeline's binary finalDecision (covered vs gap) as a proxy outcome
 * for this run; true Brier/ECE over historical application outcomes can be layered later.
 */

export function llmStrengthToProb(
  strength: "explicit" | "implicit" | "weak" | "missing" | "unknown"
): number {
  switch (strength) {
    case "explicit":
      return 0.92;
    case "implicit":
      return 0.78;
    case "weak":
      return 0.48;
    case "missing":
      return 0.12;
    default:
      return 0.52;
  }
}

/**
 * Weighted blend of deterministic hit, semantic similarity, and LLM strength.
 */
export function requirementPredictedCoverageProbability(args: {
  deterministicCovered: boolean;
  semanticSimilarity: number;
  llmStrength: "explicit" | "implicit" | "weak" | "missing" | "unknown";
}): number {
  const wDet = 0.32;
  const wSem = 0.38;
  const wLlm = 0.3;
  const det = args.deterministicCovered ? 1 : 0;
  const sem = Math.max(0, Math.min(1, args.semanticSimilarity));
  const llm = llmStrengthToProb(args.llmStrength);
  const p = wDet * det + wSem * sem + wLlm * llm;
  return Math.max(0, Math.min(1, Number(p.toFixed(4))));
}

export function binaryLabelFromFinalDecision(finalDecision: "covered" | "gap"): 0 | 1 {
  return finalDecision === "covered" ? 1 : 0;
}

export function meanBrierScore(pairs: Array<{ p: number; y: 0 | 1 }>): number {
  if (pairs.length === 0) return 0;
  let s = 0;
  for (const { p, y } of pairs) {
    s += (p - y) ** 2;
  }
  return Number((s / pairs.length).toFixed(6));
}

export interface EceBin {
  binLow: number;
  binHigh: number;
  count: number;
  avgPredicted: number;
  avgOutcome: number;
  absCalibrationGap: number;
}

/**
 * Expected calibration error (ECE) with equal-width bins on predicted probability.
 */
export function expectedCalibrationError(
  pairs: Array<{ p: number; y: 0 | 1 }>,
  binCount = 10
): { ece: number; bins: EceBin[] } {
  if (pairs.length === 0) {
    return { ece: 0, bins: [] };
  }
  const width = 1 / binCount;
  const bins: EceBin[] = [];
  let ece = 0;
  for (let b = 0; b < binCount; b += 1) {
    const low = b * width;
    const high = b === binCount - 1 ? 1.0001 : (b + 1) * width;
    const inBin = pairs.filter((x) => x.p >= low && x.p < high);
    const count = inBin.length;
    if (count === 0) {
      bins.push({
        binLow: Number(low.toFixed(4)),
        binHigh: Number(high.toFixed(4)),
        count: 0,
        avgPredicted: 0,
        avgOutcome: 0,
        absCalibrationGap: 0,
      });
      continue;
    }
    const avgP = inBin.reduce((a, x) => a + x.p, 0) / count;
    const avgY = inBin.reduce((a, x) => a + x.y, 0) / count;
    const gap = Math.abs(avgP - avgY);
    ece += (count / pairs.length) * gap;
    bins.push({
      binLow: Number(low.toFixed(4)),
      binHigh: Number(high.toFixed(4)),
      count,
      avgPredicted: Number(avgP.toFixed(4)),
      avgOutcome: Number(avgY.toFixed(4)),
      absCalibrationGap: Number(gap.toFixed(4)),
    });
  }
  return { ece: Number(ece.toFixed(6)), bins };
}

export function summarizeCalibration(pairs: Array<{ p: number; y: 0 | 1 }>): {
  sampleCount: number;
  brierScore: number;
  expectedCalibrationError: number;
  eceBins: EceBin[];
  note: string;
} {
  const { ece, bins } = expectedCalibrationError(pairs, 10);
  return {
    sampleCount: pairs.length,
    brierScore: meanBrierScore(pairs),
    expectedCalibrationError: ece,
    eceBins: bins,
    note:
      "Labels are finalDecision (covered=1, gap=0) for this run. " +
      "For production calibration, log outcomes (interview/offer) and recompute over history.",
  };
}
