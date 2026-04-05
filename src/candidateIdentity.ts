/**
 * Resolve candidate first/last name for tailoring from portfolio sources.
 * Preference: about.name in knowledge.json, then LaTeX header (\\textbf{{...}}), else defaults.
 */
import fs from "node:fs/promises";

export type CandidateNameSource = "knowledge.json" | "main.tex" | "default";

export interface ResolvedCandidateName {
  firstName: string;
  lastName: string;
  source: CandidateNameSource;
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const s = full.trim().replace(/\s+/g, " ");
  if (!s) return { firstName: "", lastName: "" };
  const parts = s.split(" ");
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/** First \\textbf{{Name}} in document (typical resume header). */
export function extractNameFromLatex(tex: string): string | null {
  const m = tex.match(/\\textbf\s*\{\{([^}]+)\}\}/);
  if (m?.[1]) return m[1].trim();
  return null;
}

export async function resolveCandidateName(opts: {
  resumePath: string;
  knowledgeJsonPath: string;
}): Promise<ResolvedCandidateName> {
  try {
    const raw = (await fs.readFile(opts.knowledgeJsonPath, "utf8")).replace(/^\uFEFF/, "");
    const k = JSON.parse(raw) as { about?: { name?: string } };
    const name = k.about?.name;
    if (typeof name === "string" && name.trim()) {
      const { firstName, lastName } = splitFullName(name);
      return { firstName, lastName, source: "knowledge.json" };
    }
  } catch {
    /* missing or invalid JSON */
  }

  try {
    const tex = await fs.readFile(opts.resumePath, "utf8");
    const extracted = extractNameFromLatex(tex);
    if (extracted) {
      const { firstName, lastName } = splitFullName(extracted);
      return { firstName, lastName, source: "main.tex" };
    }
  } catch {
    /* missing resume */
  }

  return { firstName: "Applicant", lastName: "", source: "default" };
}
