function normalizeWhitespace(s) {
    return s.replace(/\s+/g, " ").trim();
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
export function applyLatexPatch(resume, ops) {
    const lines = resume.rawText.split(/\r?\n/);
    const appliedOps = [];
    const skippedOps = [];
    const idToLineIndex = new Map();
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        const m = line.match(/%+\s*bulletId:([A-Za-z0-9_]+)\s*$/);
        if (m?.[1])
            idToLineIndex.set(m[1], i);
    }
    for (const op of ops) {
        if (op.kind === "replace_bullet") {
            const idx = idToLineIndex.get(op.bulletId);
            if (idx === undefined) {
                skippedOps.push({
                    op,
                    reason: `bulletId not found in LaTeX markers: ${op.bulletId}`,
                });
                continue;
            }
            const originalLine = lines[idx] ?? "";
            const prefix = originalLine.match(/^(\\item\s+)/)?.[1] ?? "\\item ";
            const marker = originalLine.match(/(%+\s*bulletId:[A-Za-z0-9_]+\s*)$/)?.[1];
            const safeText = normalizeWhitespace(op.newText);
            lines[idx] = `${prefix}${safeText}${marker ? " " + marker.trim() : ""}`;
            appliedOps.push(op);
            continue;
        }
        if (op.kind === "insert_bullet_after") {
            const idx = idToLineIndex.get(op.afterBulletId);
            if (idx === undefined) {
                skippedOps.push({
                    op,
                    reason: `afterBulletId not found in LaTeX markers: ${op.afterBulletId}`,
                });
                continue;
            }
            const safeText = normalizeWhitespace(op.newText);
            const newLine = `\\item ${safeText}`;
            lines.splice(idx + 1, 0, newLine);
            appliedOps.push(op);
            continue;
        }
        skippedOps.push({ op, reason: "Unknown op" });
    }
    return { latex: lines.join("\n"), appliedOps, skippedOps };
}
//# sourceMappingURL=patchLatex.js.map