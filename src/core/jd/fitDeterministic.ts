import type { ResumeDocument } from "../resume/types.js";

export interface DeterministicJdFitReport {
  fitScore: number;
  mustHaveCoverage: number;
  coveredKeywords: string[];
  missingKeywords: string[];
}

const TECH_HINTS = new Set([
  "python",
  "java",
  "go",
  "rust",
  "typescript",
  "javascript",
  "react",
  "node",
  "postgres",
  "mysql",
  "redis",
  "kafka",
  "kubernetes",
  "docker",
  "aws",
  "gcp",
  "azure",
  "llm",
  "ml",
  "inference",
  "training",
  "cuda",
  "rocm",
  "pytorch",
  "jax",
  "tensorflow",
  "onnx",
  "triton",
  "serving",
  "distributed",
  "microservice",
  "api",
  "grpc",
  "linux",
  "ci/cd",
  "observability",
  "monitoring",
  "tracing",
  "latency",
  "throughput",
  "performance",
  "scalable",
  "infrastructure",
]);

export function extractJdRequirementPhrases(text: string): string[] {
  const logisticHeaderPattern =
    /^(location|employment type|location type|department|compensation|benefits include|equal opportunity)\s*$/i;
  const logisticPattern =
    /\b(location|employment type|location type|department|compensation|equity|salary|benefits?|insurance|medical|dental|vision|401k|retirement|perks?|lunch|snacks?|beverages|flexible time off|pto|paid time off|visa|sponsorship|onsite|on-site|remote|hybrid|full[-\s]?time|part[-\s]?time|equal opportunity|equal employment|all applicants|veteran|disability status|gender identity|sexual orientation|san francisco|sciforium)\b/i;
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "have",
    "will",
    "your",
    "you",
    "are",
    "our",
    "about",
    "company",
    "seeking",
    "skilled",
    "someone",
    "who",
    "what",
    "including",
    "ideal",
    "play",
    "pivotal",
    "every",
    "entire",
    "across",
    "loves",
    "improve",
    "job",
    "role",
    "experience",
    "years",
    "year",
    "skills",
  ]);
  const normalized = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9+.#/\-\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const isTechyPhrase = (phrase: string): boolean => {
    if (!phrase) return false;
    if (/[+/#.]/.test(phrase) || /\d/.test(phrase)) return true;
    const parts = phrase.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    let techTokenCount = 0;
    for (const p of parts) {
      const root = p.endsWith("s") ? p.slice(0, -1) : p;
      if (TECH_HINTS.has(p) || TECH_HINTS.has(root)) techTokenCount += 1;
    }
    return techTokenCount > 0;
  };
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const cleaned: string[] = [];
  let skipUntilBlank = false;
  for (const line of lines) {
    if (!line) {
      skipUntilBlank = false;
      continue;
    }
    if (skipUntilBlank) continue;
    if (logisticHeaderPattern.test(line)) {
      skipUntilBlank = true;
      continue;
    }
    if (logisticPattern.test(line)) continue;
    cleaned.push(line);
  }
  const phraseSet = new Set<string>();
  for (const line of cleaned) {
    const normLine = normalized(line);
    if (!normLine) continue;
    const chunks = normLine
      .split(/[,;:()]/)
      .map((c) => c.trim())
      .filter((c) => c.length >= 3);
    for (const chunk of chunks) {
      const words = chunk
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !stop.has(w) && !/^\$?\d/.test(w));
      if (words.length === 0) continue;
      // Keep compact 1-3 word tech phrases, e.g. "distributed training", "cuda rocm", "pytorch".
      for (let n = 1; n <= 3; n += 1) {
        for (let i = 0; i <= words.length - n; i += 1) {
          const phrase = words.slice(i, i + n).join(" ");
          if (isTechyPhrase(phrase)) phraseSet.add(phrase);
        }
      }
    }
  }
  return [...phraseSet].slice(0, 120);
}

function phraseCovered(resumeText: string, phrase: string): boolean {
  if (resumeText.includes(phrase)) return true;
  const tokens = phrase.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  // Soft match for multi-token phrases: require most tokens to appear.
  let hits = 0;
  for (const t of tokens) {
    if (resumeText.includes(t)) hits += 1;
  }
  return hits / tokens.length >= 0.7;
}

export function scoreJdFitDeterministic(resume: ResumeDocument, jdText: string): DeterministicJdFitReport {
  const resumeText = resume.bullets.map((b) => b.text.toLowerCase()).join("\n");
  const keywords = extractJdRequirementPhrases(jdText).slice(0, 80);

  if (keywords.length === 0) {
    return {
      fitScore: 0,
      mustHaveCoverage: 0,
      coveredKeywords: [],
      missingKeywords: [],
    };
  }

  const covered: string[] = [];
  const missing: string[] = [];
  for (const k of keywords) {
    if (phraseCovered(resumeText, k)) covered.push(k);
    else missing.push(k);
  }
  const coverage = covered.length / keywords.length;
  return {
    fitScore: Math.round(coverage * 100),
    mustHaveCoverage: Number(coverage.toFixed(3)),
    coveredKeywords: covered,
    missingKeywords: missing,
  };
}
