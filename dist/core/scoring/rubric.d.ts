import type { ResumeDocument } from "../resume/types.js";
export type ScoreTier = "fail" | "passable" | "competitive" | "strong" | "excellent";
export interface ScoreEvidence {
    bulletId?: string;
    sectionPath?: string[];
    note: string;
}
export interface ScoreBreakdownItem {
    id: string;
    label: string;
    score: number;
    weight: number;
    tier: ScoreTier;
    evidence: ScoreEvidence[];
}
export interface AtsScoreReport {
    overallScore: number;
    overallTier: ScoreTier;
    items: ScoreBreakdownItem[];
    gates: Array<{
        id: string;
        passed: boolean;
        reason?: string;
    }>;
}
/**
 * Deterministic, strict ATS scoring v1.
 * This is intentionally conservative and evidence-driven.
 */
export declare function scoreResumeDeterministic(resume: ResumeDocument): AtsScoreReport;
//# sourceMappingURL=rubric.d.ts.map