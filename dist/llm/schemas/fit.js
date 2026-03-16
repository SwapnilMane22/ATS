import { z } from "zod";
import { EvidencePointerSchema, PlainTextSchema } from "./common.js";
import { JdNormalizedSchema } from "./jd.js";
export const ResumeEvidenceBulletSchema = z.object({
    bulletId: z.string().min(1),
    text: PlainTextSchema,
    sectionPath: z.array(z.string().min(1)).default([]),
});
export const FitExplanationRequestSchema = z.object({
    resume: z.object({
        bullets: z.array(ResumeEvidenceBulletSchema).min(1),
        skillsText: z.string().min(1).optional(),
        summaryText: z.string().min(1).optional(),
    }),
    jd: JdNormalizedSchema,
});
export const RequirementCoverageSchema = z.object({
    requirementId: z.string().min(1),
    covered: z.boolean(),
    strength: z.enum(["explicit", "implicit", "weak", "missing"]),
    evidence: z.array(EvidencePointerSchema).default([]),
    notes: z.array(z.string().min(1)).default([]),
});
export const FitExplanationResultSchema = z.object({
    fitScore: z.number().min(0).max(100),
    tier: z.enum(["strong_fit", "borderline", "not_a_fit"]),
    mustHaveCoverage: z.number().min(0).max(1),
    niceToHaveCoverage: z.number().min(0).max(1),
    coverage: z.array(RequirementCoverageSchema).min(1),
    gaps: z
        .array(z.object({
        requirementId: z.string().min(1),
        prompt: z.string().min(1),
        suggestedActions: z.array(z.string().min(1)).default([]),
    }))
        .default([]),
    tailoredSuggestions: z
        .array(z.object({
        sectionHint: z.string().min(1).optional(),
        suggestion: z.string().min(1),
        evidence: z.array(EvidencePointerSchema).default([]),
    }))
        .default([]),
});
//# sourceMappingURL=fit.js.map