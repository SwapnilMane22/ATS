import type { ResumeDocument } from "../resume/types.js";
import { postJson } from "../../llm/http.js";
import { extractJdRequirementPhrases } from "./fitDeterministic.js";

interface OllamaEmbedResponse {
  embedding?: number[];
  embeddings?: number[][];
}

export interface SemanticCoverageItem {
  requirement: string;
  bestBulletId: string | null;
  bestBulletText: string | null;
  similarity: number;
}

export interface SemanticFitReport {
  model: string;
  fitScore: number;
  averageSimilarity: number;
  coverage: SemanticCoverageItem[];
  notes: string[];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let an = 0;
  let bn = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i]! * b[i]!;
    an += a[i]! * a[i]!;
    bn += b[i]! * b[i]!;
  }
  if (an === 0 || bn === 0) return 0;
  return dot / (Math.sqrt(an) * Math.sqrt(bn));
}

async function embedTexts(baseUrl: string, model: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) {
    // New endpoint first.
    try {
      const res = await postJson<OllamaEmbedResponse>(`${baseUrl}/api/embed`, {
        model,
        input: text,
      });
      if (res.embedding) {
        out.push(res.embedding);
        continue;
      }
      if (Array.isArray(res.embeddings) && res.embeddings[0]) {
        out.push(res.embeddings[0]);
        continue;
      }
    } catch {
      // try old endpoint
    }
    const legacy = await postJson<OllamaEmbedResponse>(`${baseUrl}/api/embeddings`, {
      model,
      prompt: text,
    });
    if (!legacy.embedding) {
      throw new Error(`Embedding failed for text: ${text.slice(0, 80)}...`);
    }
    out.push(legacy.embedding);
  }
  return out;
}

export async function scoreJdFitSemanticWithEmbeddings(
  resume: ResumeDocument,
  jdText: string
): Promise<SemanticFitReport> {
  const base = (process.env.ATS_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.ATS_EMBED_MODEL ?? "nomic-embed-text";
  const requirements = extractJdRequirementPhrases(jdText).slice(0, 80);
  const bullets = resume.bullets;

  if (requirements.length === 0 || bullets.length === 0) {
    return {
      model,
      fitScore: 0,
      averageSimilarity: 0,
      coverage: [],
      notes: ["No JD requirements or resume bullets available for semantic matching."],
    };
  }

  const reqEmb = await embedTexts(base, model, requirements);
  const bulletEmb = await embedTexts(
    base,
    model,
    bullets.map((b) => b.text)
  );

  const coverage: SemanticCoverageItem[] = [];
  const sims: number[] = [];

  for (let i = 0; i < requirements.length; i += 1) {
    let bestIdx = -1;
    let best = -1;
    for (let j = 0; j < bulletEmb.length; j += 1) {
      const s = clamp01((cosine(reqEmb[i]!, bulletEmb[j]!) + 1) / 2);
      if (s > best) {
        best = s;
        bestIdx = j;
      }
    }
    sims.push(best);
    coverage.push({
      requirement: requirements[i]!,
      bestBulletId: bestIdx >= 0 ? bullets[bestIdx]!.bulletId : null,
      bestBulletText: bestIdx >= 0 ? bullets[bestIdx]!.text : null,
      similarity: Number(best.toFixed(4)),
    });
  }

  const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
  return {
    model,
    fitScore: Math.round(avg * 100),
    averageSimilarity: Number(avg.toFixed(4)),
    coverage,
    notes: [
      "Semantic fit uses local embedding cosine similarity between each extracted JD requirement phrase and resume bullets.",
      "Scores are 0..100 from normalized cosine similarity.",
    ],
  };
}
