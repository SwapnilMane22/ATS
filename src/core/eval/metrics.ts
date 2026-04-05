export type OutcomeLabel = "rejected" | "screen" | "interview" | "offer";

export interface EvalRecord {
  applicationId: string;
  candidateId: string;
  jdId: string;
  finalScore: number;
  confidence: number;
  decisionBand: "apply_strong" | "apply_borderline" | "skip";
  outcome: OutcomeLabel;
}

export interface EvalSummary {
  total: number;
  precision: number;
  recall: number;
  f1: number;
  confusion: { tp: number; fp: number; fn: number; tn: number };
  rankCorrelationSpearman: number;
  calibrationByBin: Array<{ binStart: number; binEnd: number; avgConfidence: number; observedPositiveRate: number; count: number }>;
  benchmark: {
    topKHitRate: number;
    conversionByScoreBucket: Array<{ bucket: string; conversion: number; count: number }>;
    interviewLiftVsBaseline: number;
  };
}

function isPositiveOutcome(o: OutcomeLabel): boolean {
  return o === "interview" || o === "offer";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length).fill(0);
  for (let r = 0; r < indexed.length; r += 1) out[indexed[r]!.i] = r + 1;
  return out;
}

function spearman(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const rx = rank(x);
  const ry = rank(y);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

export function computeEvalSummary(records: EvalRecord[]): EvalSummary {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const r of records) {
    const predictedPositive = r.decisionBand !== "skip";
    const positive = isPositiveOutcome(r.outcome);
    if (predictedPositive && positive) tp += 1;
    else if (predictedPositive && !positive) fp += 1;
    else if (!predictedPositive && positive) fn += 1;
    else tn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const yScore = records.map((r) => r.finalScore);
  const yTrueRank = records.map((r) => (isPositiveOutcome(r.outcome) ? 1 : 0));
  const rankCorrelationSpearman = spearman(yScore, yTrueRank);

  const bins = [
    [0.0, 0.2],
    [0.2, 0.4],
    [0.4, 0.6],
    [0.6, 0.8],
    [0.8, 1.01],
  ] as const;
  const calibrationByBin = bins.map(([start, end]) => {
    const inBin = records.filter((r) => r.confidence >= start && r.confidence < end);
    const avgConfidence = inBin.length ? mean(inBin.map((r) => r.confidence)) : 0;
    const observedPositiveRate = inBin.length
      ? mean(inBin.map((r) => (isPositiveOutcome(r.outcome) ? 1 : 0)))
      : 0;
    return {
      binStart: start,
      binEnd: end,
      avgConfidence: Number(clamp01(avgConfidence).toFixed(4)),
      observedPositiveRate: Number(clamp01(observedPositiveRate).toFixed(4)),
      count: inBin.length,
    };
  });

  const sorted = [...records].sort((a, b) => b.finalScore - a.finalScore);
  const k = Math.max(1, Math.floor(sorted.length * 0.2));
  const top = sorted.slice(0, k);
  const topKHitRate = top.length
    ? mean(top.map((r) => (isPositiveOutcome(r.outcome) ? 1 : 0)))
    : 0;
  const baseline = records.length
    ? mean(records.map((r) => (isPositiveOutcome(r.outcome) ? 1 : 0)))
    : 0;
  const interviewLiftVsBaseline = baseline > 0 ? topKHitRate / baseline : 0;

  const buckets: Array<{ name: string; min: number; max: number }> = [
    { name: "0-39", min: 0, max: 39 },
    { name: "40-59", min: 40, max: 59 },
    { name: "60-79", min: 60, max: 79 },
    { name: "80-100", min: 80, max: 100 },
  ];
  const conversionByScoreBucket = buckets.map((b) => {
    const inBucket = records.filter((r) => r.finalScore >= b.min && r.finalScore <= b.max);
    const conversion = inBucket.length
      ? mean(inBucket.map((r) => (isPositiveOutcome(r.outcome) ? 1 : 0)))
      : 0;
    return { bucket: b.name, conversion: Number(conversion.toFixed(4)), count: inBucket.length };
  });

  return {
    total: records.length,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    confusion: { tp, fp, fn, tn },
    rankCorrelationSpearman: Number(rankCorrelationSpearman.toFixed(4)),
    calibrationByBin,
    benchmark: {
      topKHitRate: Number(topKHitRate.toFixed(4)),
      conversionByScoreBucket,
      interviewLiftVsBaseline: Number(interviewLiftVsBaseline.toFixed(4)),
    },
  };
}
