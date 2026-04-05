import type { ResumeDocument } from "../resume/types.js";
export type LatexPatchOp = {
    kind: "replace_bullet";
    bulletId: string;
    /** Clean plaintext of the original bullet (from parseLatexResume) */
    originalText: string;
    /** Clean plaintext replacement from LLM — NO LaTeX escapes needed */
    newText: string;
} | {
    kind: "insert_bullet_after";
    afterBulletId: string;
    newText: string;
};
export interface ApplyLatexPatchResult {
    latex: string;
    appliedOps: LatexPatchOp[];
    skippedOps: Array<{
        op: LatexPatchOp;
        reason: string;
    }>;
}
/**
 * Applies patch operations to LaTeX source.
 *
 * Match priority per bullet:
 *  1. `% bulletId:xx` inline comment markers (if present in source)
 *  2. Normalised text match of `originalText` against raw \item line content
 *  3. Stripped-text match (LaTeX escapes removed)
 *  4. Prefix substring match (first 60 chars)
 *
 * On match, the new text is sanitized for LaTeX and the original line's
 * trailing LaTeX layout suffix (e.g. \\[-6pt]) is preserved.
 */
export declare function applyLatexPatch(resume: ResumeDocument, ops: LatexPatchOp[]): ApplyLatexPatchResult;
//# sourceMappingURL=patchLatex.d.ts.map