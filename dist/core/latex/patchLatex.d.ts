import type { ResumeDocument } from "../resume/types.js";
export type LatexPatchOp = {
    kind: "replace_bullet";
    bulletId: string;
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
 * Applies patch operations to LaTeX by matching bullets using `bulletId` markers.
 *
 * NOTE: This requires that the LaTeX contains bulletId markers to make patching reliable.
 * In v1, we support an inline marker convention:
 *   \\item ... % bulletId:b_xxxxx
 *
 * If markers are missing, ops are skipped.
 */
export declare function applyLatexPatch(resume: ResumeDocument, ops: LatexPatchOp[]): ApplyLatexPatchResult;
//# sourceMappingURL=patchLatex.d.ts.map