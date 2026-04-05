import type { ResumeDocument } from "../resume/types.js";
export interface ParseLatexOptions {
    idSeed?: string;
}
/**
 * Strip LaTeX layout suffixes from the end of a bullet line.
 * These are spacing/visual commands that are NOT part of the bullet content:
 *   \\[-6pt]   \\[2pt]   \\[4pt]   \\   \newline   \hfill etc.
 *
 * Returns { text: cleanText, suffix: latexSuffix }
 * The suffix must be preserved when patching so the LaTeX layout is unchanged.
 */
export declare function splitBulletSuffix(raw: string): {
    text: string;
    suffix: string;
};
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
export declare function parseLatexResume(latex: string, opts?: ParseLatexOptions): ResumeDocument;
//# sourceMappingURL=parseLatex.d.ts.map