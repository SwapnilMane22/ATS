import type { ResumeBullet } from "../resume/types.js";

export type BulletScoreDimension =
  | "action"
  | "scope"
  | "tools"
  | "impact"
  | "ownership";

export interface BulletDimensionScore {
  dim: BulletScoreDimension;
  score: number; // 0..5
  notes: string[];
}

export interface BulletQualityScore {
  bulletId: string;
  total: number; // 0..5
  dimensions: BulletDimensionScore[];
}

function scoreAction(text: string): BulletDimensionScore {
  const notes: string[] = [];
  const hasVerb = /^[A-Za-z]+\b/.test(text);
  const weak = /\b(responsible for|worked on|helped with|assisted with|participated in)\b/i.test(
    text
  );

  let score = 0;
  if (hasVerb) {
    score = 3;
    notes.push("Starts with a verb.");
  } else {
    notes.push("Does not clearly start with an action verb.");
  }
  if (weak) {
    score -= 1;
    notes.push("Uses weak phrasing like 'responsible for' or 'worked on'.");
  }

  return { dim: "action", score: Math.max(0, score), notes };
}

function scoreImpact(text: string): BulletDimensionScore {
  const notes: string[] = [];
  const hasMetric = /(\b\d+(\.\d+)?\b|%|\$\b|ms\b|s\b|x\b)/i.test(text);
  if (hasMetric) {
    notes.push("Contains a concrete metric or scale indicator.");
    return { dim: "impact", score: 5, notes };
  }
  notes.push("No explicit metrics detected; consider adding concrete numbers or deltas.");
  return { dim: "impact", score: 2, notes };
}

function scoreScope(text: string): BulletDimensionScore {
  const notes: string[] = [];
  const hasScope =
    /\b(users?|customers?|requests?|qps|rps|services?|microservices?|clusters?|regions?)\b/i.test(
      text
    );
  if (hasScope) {
    notes.push("Mentions scope such as users, services, or traffic.");
    return { dim: "scope", score: 4, notes };
  }
  notes.push("Scope is vague; consider adding scale (users, services, volume).");
  return { dim: "scope", score: 2, notes };
}

function scoreTools(text: string): BulletDimensionScore {
  const notes: string[] = [];
  const hasTools =
    /\b(Java|Kotlin|Go|Golang|Python|TypeScript|JavaScript|React|Node\.js|Postgres|MySQL|Redis|Kafka|Kubernetes|Docker|AWS|GCP|Azure)\b/.test(
      text
    );
  if (hasTools) {
    notes.push("Names specific technologies or tools.");
    return { dim: "tools", score: 4, notes };
  }
  notes.push("No explicit technologies named; add key tools where relevant.");
  return { dim: "tools", score: 2, notes };
}

function scoreOwnership(text: string): BulletDimensionScore {
  const notes: string[] = [];
  const leader =
    /\b(led|owned|managed|drove|spearheaded|architected|designed|mentored)\b/i.test(text);
  if (leader) {
    notes.push("Shows strong ownership or leadership language.");
    return { dim: "ownership", score: 5, notes };
  }
  notes.push("Consider highlighting ownership (led, owned, drove) where accurate.");
  return { dim: "ownership", score: 2, notes };
}

export function scoreBulletQuality(bullet: ResumeBullet): BulletQualityScore {
  const dims = [
    scoreAction(bullet.text),
    scoreScope(bullet.text),
    scoreTools(bullet.text),
    scoreImpact(bullet.text),
    scoreOwnership(bullet.text),
  ];
  const total =
    dims.reduce((acc, d) => acc + d.score, 0) / (dims.length || 1);
  return {
    bulletId: bullet.bulletId,
    total,
    dimensions: dims,
  };
}

export function scoreAllBulletsQuality(bullets: ResumeBullet[]): BulletQualityScore[] {
  return bullets.map(scoreBulletQuality);
}

