import crypto from "node:crypto";
import type { ResumeBullet, ResumeDocument, ResumeSection, SectionPath } from "../resume/types.js";

export interface ParseLatexOptions {
  /**
   * Seed used for stable bulletId generation.
   * Change if you want IDs to differ across resumes/environments.
   */
  idSeed?: string;
}

function stableId(seed: string, sectionPath: SectionPath, text: string): string {
  const h = crypto
    .createHash("sha256")
    .update(seed)
    .update("\n")
    .update(sectionPath.join(" > "))
    .update("\n")
    .update(text.trim())
    .digest("hex")
    .slice(0, 16);
  return `b_${h}`;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Minimal LaTeX resume parser.
 *
 * Supported:
 * - \\section{Title} and \\subsection{Title}
 * - itemize/enumerate with \\item bullets
 *
 * Output:
 * - sections with hierarchical paths
 * - bullets with stable IDs and section paths
 */
export function parseLatexResume(
  latex: string,
  opts: ParseLatexOptions = {}
): ResumeDocument {
  const seed = opts.idSeed ?? "ats-engine-v1";

  const sections: ResumeSection[] = [];
  const bullets: ResumeBullet[] = [];

  let currentSectionPath: SectionPath = [];
  let inListDepth = 0;

  const lines = latex.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("%")) continue; // comment

    const sec = line.match(/^\\section\{(.+)\}$/);
    if (sec) {
      currentSectionPath = [normalizeWhitespace(sec[1] ?? "")];
      sections.push({
        title: currentSectionPath[0]!,
        path: [...currentSectionPath],
      });
      continue;
    }

    const subsec = line.match(/^\\subsection\{(.+)\}$/);
    if (subsec) {
      const title = normalizeWhitespace(subsec[1] ?? "");
      currentSectionPath = [currentSectionPath[0] ?? "Uncategorized", title];
      sections.push({ title, path: [...currentSectionPath] });
      continue;
    }

    if (/^\\begin\{(itemize|enumerate)\}/.test(line)) {
      inListDepth += 1;
      continue;
    }
    if (/^\\end\{(itemize|enumerate)\}/.test(line)) {
      inListDepth = Math.max(0, inListDepth - 1);
      continue;
    }

    const item = line.match(/^\\item\s+(.+)$/);
    if (item && inListDepth > 0) {
      const text = normalizeWhitespace(item[1] ?? "");
      const bulletId = stableId(seed, currentSectionPath, text);
      bullets.push({
        bulletId,
        text,
        sectionPath: [...currentSectionPath],
      });
      continue;
    }
  }

  return {
    source: "latex",
    sections,
    bullets,
    rawText: latex,
  };
}

