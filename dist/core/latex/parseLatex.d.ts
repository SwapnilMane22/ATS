import type { ResumeDocument } from "../resume/types.js";
export interface ParseLatexOptions {
    /**
     * Seed used for stable bulletId generation.
     * Change if you want IDs to differ across resumes/environments.
     */
    idSeed?: string;
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
export declare function parseLatexResume(latex: string, opts?: ParseLatexOptions): ResumeDocument;
//# sourceMappingURL=parseLatex.d.ts.map