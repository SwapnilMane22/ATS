import { z } from "zod";
export declare const JdRawInputSchema: z.ZodObject<{
    text: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    capturedAtIso: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type JdRawInput = z.infer<typeof JdRawInputSchema>;
export declare const JdRequirementSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type JdRequirement = z.infer<typeof JdRequirementSchema>;
export declare const JdNormalizedSchema: z.ZodObject<{
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
export type JdNormalized = z.infer<typeof JdNormalizedSchema>;
//# sourceMappingURL=jd.d.ts.map