import crypto from "node:crypto";
import type { ResumeBullet, ResumeDocument, ResumeSection, SectionPath } from "../resume/types.js";

export interface ParseLatexOptions {
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
 * Strip LaTeX markup from a section title to get clean display text.
 * Handles: \href{url}{text} → text, \textbf{x} → x, \MakeUppercase{x} → x, {x} → x
 */
function cleanSectionTitle(raw: string): string {
  let s = raw;
  // \href{url}{display} → display
  s = s.replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1");
  // \textbf{x}, \textit{x}, \MakeUppercase{x} etc → x
  s = s.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1");
  // bare {x} → x
  s = s.replace(/\{([^}]*)\}/g, "$1");
  // strip remaining backslash commands
  s = s.replace(/\\[a-zA-Z]+/g, " ");
  return normalizeWhitespace(s);
}

/**
 * Strip LaTeX layout suffixes from the end of a bullet line.
 * These are spacing/visual commands that are NOT part of the bullet content:
 *   \\[-6pt]   \\[2pt]   \\[4pt]   \\   \newline   \hfill etc.
 *
 * Returns { text: cleanText, suffix: latexSuffix }
 * The suffix must be preserved when patching so the LaTeX layout is unchanged.
 */
export function splitBulletSuffix(raw: string): { text: string; suffix: string } {
  // Match trailing LaTeX layout commands at end of the bullet:
  //  - \\[-6pt]  \\[4pt]  \\   (line break with optional spacing arg)
  //  - \newline
  //  - \hfill  (used in some templates)
  const suffixPattern = /(\s*(\\\\(\[[-0-9a-z.]+\])?|\\newline\b|\\hfill\b)\s*)+$/i;
  const match = raw.match(suffixPattern);
  if (match) {
    const suffix = match[0];
    const text = raw.slice(0, raw.length - suffix.length).trimEnd();
    return { text, suffix };
  }
  return { text: raw, suffix: "" };
}

/**
 * Minimal LaTeX resume parser.
 *
 * Supported:
 * - \section{Title} and \subsection{Title}
 * - itemize/enumerate with \item bullets
 *
 * Bullet text stored is clean plaintext (LaTeX layout suffixes stripped).
 * The raw line remains in rawText for faithful patch-back.
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

    // \section{...}  — note: also handles \section*{...} and \section{\href{...}{...}}
    const sec = line.match(/^\\section\*?\{(.+)\}$/);
    if (sec) {
      const cleanTitle = cleanSectionTitle(sec[1] ?? "");
      currentSectionPath = [cleanTitle];
      sections.push({
        title: cleanTitle,
        path: [...currentSectionPath],
      });
      continue;
    }

    const subsec = line.match(/^\\subsection\{(.+)\}$/);
    if (subsec) {
      const title = cleanSectionTitle(subsec[1] ?? "");
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
      const rawContent = item[1] ?? "";
      // Strip trailing LaTeX layout suffixes — keep only printable content
      const { text: cleanText } = splitBulletSuffix(rawContent);
      // cleanText still contains LaTeX escapes (\$, \%, etc.) — this is rawLatex
      const text = normalizeWhitespace(cleanText);
      if (!text) continue; // skip empty
      const bulletId = stableId(seed, currentSectionPath, text);
      bullets.push({
        bulletId,
        text,
        // Preserve the LaTeX-escaped form for LLM input (before whitespace normalization)
        rawLatex: cleanText.trim(),
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
