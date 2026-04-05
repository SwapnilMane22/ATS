import { splitBulletSuffix } from "./parseLatex.js";
function normalizeWhitespace(s) {
    return s.replace(/\s+/g, " ").trim();
}
/**
 * Escape bare $ signs in plain text so they are valid LaTeX.
 * The LLM outputs plain "$16,000" but LaTeX needs "\$16,000".
 */
function escapeLatexDollars(text) {
    // Only escape $ that aren't already preceded by a backslash
    return text.replace(/(?<!\\)\$/g, "\\$");
}
/**
 * Escape & signs in plain text so they are valid LaTeX.
 */
function escapeLatexAmpersand(text) {
    return text.replace(/(?<!\\)&/g, "\\&");
}
/**
 * Sanitize LLM-generated LaTeX bullet text before writing to .tex file.
 *
 * The LLM now receives real LaTeX-formatted bullets and returns LaTeX-formatted output.
 * This function handles the edge cases:
 * - Escape bare $ that the LLM introduced without escaping (negative lookbehind: not already \$)
 * - Escape bare & that the LLM introduced without escaping
 * - Escape bare % that the LLM introduced without escaping
 * - Strip any trailing layout commands the LLM accidentally appended (\\[-6pt] etc.)
 *   — these are added back by the patcher from the original line
 * - Never double-escape already-escaped sequences (\$ stays \$, not \\$)
 */
function sanitizeLatexRewrite(text) {
    let s = text;
    // Strip any trailing layout suffix the LLM may have included
    // (the patcher adds these back from the original line)
    s = s.replace(/\s*(\\\\(\[[-0-9a-z.]+\])?)\s*$/, "");
    s = s.replace(/\s*\\newline\s*$/, "");
    // Escape bare $ not preceded by backslash
    s = s.replace(/(?<!\\)\$/g, "\\$");
    // Escape bare % not preceded by backslash
    s = s.replace(/(?<!\\)%/g, "\\%");
    // Escape bare & not preceded by backslash
    s = s.replace(/(?<!\\)&/g, "\\&");
    return normalizeWhitespace(s);
}
/**
 * Strip LaTeX commands to get plain text for fuzzy matching.
 */
function stripLatexForMatch(s) {
    return s
        .replace(/\\newline\b/g, " ")
        .replace(/\\[a-zA-Z]+\{[^}]*\}/g, (m) => {
        const inner = m.match(/\\[a-zA-Z]+\{([^}]*)\}/);
        return inner?.[1] ?? "";
    })
        .replace(/\\[a-zA-Z]+/g, "")
        .replace(/\\\$/g, "$")
        .replace(/\\&/g, "&")
        .replace(/\\\\/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
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
export function applyLatexPatch(resume, ops) {
    const lines = resume.rawText.split(/\r?\n/);
    const appliedOps = [];
    const skippedOps = [];
    // Index 1: bulletId marker comments
    const idToLineIndex = new Map();
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        const m = line.match(/%+\s*bulletId:([A-Za-z0-9_]+)\s*$/);
        if (m?.[1])
            idToLineIndex.set(m[1], i);
    }
    // Index 2: text content → line index
    const textToLineIndex = new Map();
    const strippedToLineIndex = new Map();
    for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i] ?? "";
        const itemMatch = raw.match(/^(\s*)\\item\s+(.+)$/);
        if (itemMatch) {
            const rawContent = itemMatch[2] ?? "";
            const { text: withoutSuffix } = splitBulletSuffix(rawContent);
            const norm = normalizeWhitespace(withoutSuffix);
            const stripped = normalizeWhitespace(stripLatexForMatch(withoutSuffix));
            if (norm)
                textToLineIndex.set(norm, i);
            if (stripped && stripped !== norm)
                strippedToLineIndex.set(stripped, i);
            // Also index the full raw content (with suffix) in case of partial matches
            const normFull = normalizeWhitespace(rawContent);
            if (normFull && normFull !== norm)
                textToLineIndex.set(normFull, i);
        }
    }
    for (const op of ops) {
        if (op.kind === "replace_bullet") {
            // 1. bulletId marker
            let idx = idToLineIndex.get(op.bulletId);
            // 2. Text match
            if (idx === undefined && op.originalText) {
                const normTarget = normalizeWhitespace(op.originalText);
                const strippedTarget = normalizeWhitespace(stripLatexForMatch(op.originalText));
                idx = textToLineIndex.get(normTarget)
                    ?? strippedToLineIndex.get(strippedTarget)
                    ?? textToLineIndex.get(strippedTarget);
                // 3. Prefix substring match
                if (idx === undefined) {
                    const searchFor = strippedTarget.slice(0, 60);
                    if (searchFor.length >= 20) {
                        for (let i = 0; i < lines.length; i++) {
                            const raw = lines[i] ?? "";
                            if (raw.match(/^(\s*)\\item\s+/) && stripLatexForMatch(raw).includes(searchFor)) {
                                idx = i;
                                break;
                            }
                        }
                    }
                }
            }
            if (idx === undefined) {
                skippedOps.push({
                    op,
                    reason: `No match for bullet "${op.originalText?.slice(0, 80)}" (id: ${op.bulletId})`,
                });
                continue;
            }
            const originalLine = lines[idx] ?? "";
            // Preserve original indentation
            const indent = originalLine.match(/^(\s*)/)?.[1] ?? "";
            // Preserve original trailing LaTeX layout suffix (\\[-6pt] etc.)
            const itemMatch = originalLine.match(/^(\s*)\\item\s+(.+)$/);
            const originalContent = itemMatch?.[2] ?? "";
            const { suffix: trailingSuffix } = splitBulletSuffix(originalContent);
            // Preserve bulletId marker comment if present
            const markerMatch = originalLine.match(/(%+\s*bulletId:[A-Za-z0-9_]+\s*)$/);
            const marker = markerMatch?.[1] ?? "";
            // Sanitize LLM LaTeX output (handles bare $, %, & and strips trailing layout suffixes)
            const safeText = sanitizeLatexRewrite(op.newText);
            // Reconstruct the line: indent + \item + newText + original suffix + marker
            const suffix = trailingSuffix.trim() ? ` ${trailingSuffix.trim()}` : "";
            const markerPart = marker ? ` ${marker.trim()}` : "";
            lines[idx] = `${indent}\\item ${safeText}${suffix}${markerPart}`;
            appliedOps.push(op);
            continue;
        }
        if (op.kind === "insert_bullet_after") {
            const idx = idToLineIndex.get(op.afterBulletId);
            if (idx === undefined) {
                skippedOps.push({
                    op,
                    reason: `afterBulletId not found: ${op.afterBulletId}`,
                });
                continue;
            }
            const originalLine = lines[idx] ?? "";
            const indent = originalLine.match(/^(\s*)/)?.[1] ?? "";
            const safeText = sanitizeLatexRewrite(op.newText);
            lines.splice(idx + 1, 0, `${indent}\\item ${safeText}`);
            appliedOps.push(op);
            continue;
        }
        skippedOps.push({ op, reason: "Unknown op kind" });
    }
    return { latex: lines.join("\n"), appliedOps, skippedOps };
}
//# sourceMappingURL=patchLatex.js.map