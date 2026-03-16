import type { ResumeDocument } from "../resume/types.js";

export type ScoreTier = "fail" | "passable" | "competitive" | "strong" | "excellent";

export interface ScoreEvidence {
  bulletId?: string;
  sectionPath?: string[];
  note: string;
}

export interface ScoreBreakdownItem {
  id: string;
  label: string;
  score: number; // 0..1
  weight: number; // relative weight
  tier: ScoreTier;
  evidence: ScoreEvidence[];
}

export interface AtsScoreReport {
  overallScore: number; // 0..100
  overallTier: ScoreTier;
  items: ScoreBreakdownItem[];
  gates: Array<{ id: string; passed: boolean; reason?: string }>;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function tierFromScore01(s: number): ScoreTier {
  if (s < 0.2) return "fail";
  if (s < 0.4) return "passable";
  if (s < 0.6) return "competitive";
  if (s < 0.8) return "strong";
  return "excellent";
}

function containsWeakVerb(text: string): boolean {
  return /\b(responsible for|worked on|helped with|assisted with|participated in)\b/i.test(
    text
  );
}

function containsMetric(text: string): boolean {
  return /(\b\d+(\.\d+)?\b|%|\$\b|ms\b|s\b|x\b)/i.test(text);
}

function startsWithStrongVerb(text: string): boolean {
  return /^[A-Za-z]+\b/.test(text) && !/^(i|we|our)\b/i.test(text);
}

/**
 * Deterministic, strict ATS scoring v1.
 * This is intentionally conservative and evidence-driven.
 */
export function scoreResumeDeterministic(resume: ResumeDocument): AtsScoreReport {
  const gates: AtsScoreReport["gates"] = [];

  const hasSections = resume.sections.length >= 3;
  if (hasSections) {
    gates.push({ id: "has_sections", passed: true });
  } else {
    gates.push({
      id: "has_sections",
      passed: false,
      reason: "Not enough recognizable \\section headings.",
    });
  }

  const bulletCount = resume.bullets.length;
  const hasBullets = bulletCount >= 8;
  if (hasBullets) {
    gates.push({ id: "has_bullets", passed: true });
  } else {
    gates.push({
      id: "has_bullets",
      passed: false,
      reason: "Not enough \\item bullets detected.",
    });
  }

  const gatePenaltyCap = gates.some((g) => !g.passed) ? 65 : 100;

  // Bullet quality scoring
  let strongVerbCount = 0;
  let metricCount = 0;
  let weakVerbCount = 0;
  for (const b of resume.bullets) {
    if (startsWithStrongVerb(b.text)) strongVerbCount += 1;
    if (containsMetric(b.text)) metricCount += 1;
    if (containsWeakVerb(b.text)) weakVerbCount += 1;
  }

  const strongVerbRate = bulletCount ? strongVerbCount / bulletCount : 0;
  const metricRate = bulletCount ? metricCount / bulletCount : 0;
  const weakVerbRate = bulletCount ? weakVerbCount / bulletCount : 0;

  const items: ScoreBreakdownItem[] = [
    {
      id: "structure_sections",
      label: "Structure: sections present",
      score: clamp01(resume.sections.length / 6),
      weight: 0.2,
      tier: tierFromScore01(clamp01(resume.sections.length / 6)),
      evidence: [
        {
          note: `Detected ${resume.sections.length} sections.`,
        },
      ],
    },
    {
      id: "bullet_action_verbs",
      label: "Experience bullets: strong action verbs",
      score: clamp01(strongVerbRate),
      weight: 0.25,
      tier: tierFromScore01(clamp01(strongVerbRate)),
      evidence: [
        { note: `Strong-verb bullets: ${strongVerbCount}/${bulletCount}.` },
      ],
    },
    {
      id: "bullet_metrics",
      label: "Experience bullets: quantified impact",
      score: clamp01(metricRate / 0.6), // strict: want ~60% bullets with metrics
      weight: 0.35,
      tier: tierFromScore01(clamp01(metricRate / 0.6)),
      evidence: [{ note: `Metric bullets: ${metricCount}/${bulletCount}.` }],
    },
    {
      id: "weak_verbs_penalty",
      label: "Penalty: weak verbs/filler",
      score: clamp01(1 - weakVerbRate / 0.3), // strict: >30% weak is bad
      weight: 0.2,
      tier: tierFromScore01(clamp01(1 - weakVerbRate / 0.3)),
      evidence: [{ note: `Weak-verb bullets: ${weakVerbCount}/${bulletCount}.` }],
    },
  ];

  const weighted = items.reduce((acc, it) => acc + it.score * it.weight, 0);
  const weightSum = items.reduce((acc, it) => acc + it.weight, 0) || 1;
  let overall = (weighted / weightSum) * 100;

  overall = Math.min(overall, gatePenaltyCap);

  return {
    overallScore: Math.round(overall),
    overallTier: tierFromScore01(overall / 100),
    items,
    gates,
  };
}

