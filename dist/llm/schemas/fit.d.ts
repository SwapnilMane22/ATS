import { z } from "zod";
export declare const ResumeEvidenceBulletSchema: z.ZodObject<{
    bulletId: z.ZodString;
    text: z.ZodString;
    sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ResumeEvidenceBullet = z.infer<typeof ResumeEvidenceBulletSchema>;
export declare const FitExplanationRequestSchema: z.ZodObject<{
    resume: z.ZodObject<{
        bullets: z.ZodArray<z.ZodObject<{
            bulletId: z.ZodString;
            text: z.ZodString;
            sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        skillsText: z.ZodOptional<z.ZodString>;
        summaryText: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    jd: z.ZodObject<{
        summary: z.ZodString;
        requirements: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            kind: z.ZodEnum<{
                must_have: "must_have";
                nice_to_have: "nice_to_have";
                responsibility: "responsibility";
            }>;
            category: z.ZodDefault<z.ZodEnum<{
                hard_skill: "hard_skill";
                soft_skill: "soft_skill";
                domain: "domain";
                seniority: "seniority";
                education: "education";
                other: "other";
            }>>;
            signals: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        mustHaveIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        niceToHaveIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        responsibilityIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        inferredRoleTitles: z.ZodDefault<z.ZodArray<z.ZodString>>;
        senioritySignals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type FitExplanationRequest = z.infer<typeof FitExplanationRequestSchema>;
export declare const RequirementCoverageSchema: z.ZodObject<{
    requirementId: z.ZodString;
    covered: z.ZodBoolean;
    strength: z.ZodEnum<{
        explicit: "explicit";
        implicit: "implicit";
        weak: "weak";
        missing: "missing";
    }>;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        bulletId: z.ZodString;
        sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;
export declare const FitExplanationResultSchema: z.ZodObject<{
    fitScore: z.ZodNumber;
    tier: z.ZodEnum<{
        strong_fit: "strong_fit";
        borderline: "borderline";
        not_a_fit: "not_a_fit";
    }>;
    mustHaveCoverage: z.ZodNumber;
    niceToHaveCoverage: z.ZodNumber;
    coverage: z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        covered: z.ZodBoolean;
        strength: z.ZodEnum<{
            explicit: "explicit";
            implicit: "implicit";
            weak: "weak";
            missing: "missing";
        }>;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            bulletId: z.ZodString;
            sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    gaps: z.ZodDefault<z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        prompt: z.ZodString;
        suggestedActions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    tailoredSuggestions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sectionHint: z.ZodOptional<z.ZodString>;
        suggestion: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            bulletId: z.ZodString;
            sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type FitExplanationResult = z.infer<typeof FitExplanationResultSchema>;
//# sourceMappingURL=fit.d.ts.map