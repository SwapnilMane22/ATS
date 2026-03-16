import { z } from "zod";
export declare const BulletInputSchema: z.ZodObject<{
    bulletId: z.ZodString;
    text: z.ZodString;
    sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
    jobTitle: z.ZodOptional<z.ZodString>;
    company: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BulletInput = z.infer<typeof BulletInputSchema>;
export declare const BulletClassificationRequestSchema: z.ZodObject<{
    bullets: z.ZodArray<z.ZodObject<{
        bulletId: z.ZodString;
        text: z.ZodString;
        sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
        jobTitle: z.ZodOptional<z.ZodString>;
        company: z.ZodOptional<z.ZodString>;
        startDate: z.ZodOptional<z.ZodString>;
        endDate: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    knownRoles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        label: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    knownCompetencies: z.ZodDefault<z.ZodArray<z.ZodObject<{
        competencyId: z.ZodString;
        label: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type BulletClassificationRequest = z.infer<typeof BulletClassificationRequestSchema>;
export declare const BulletLabelSchema: z.ZodObject<{
    bulletId: z.ZodString;
    inferredRoles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        confidence: z.ZodNumber;
        rationale: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    inferredCompetencies: z.ZodDefault<z.ZodArray<z.ZodObject<{
        competencyId: z.ZodString;
        confidence: z.ZodNumber;
        rationale: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    senioritySignals: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type BulletLabel = z.infer<typeof BulletLabelSchema>;
export declare const BulletClassificationResultSchema: z.ZodObject<{
    bulletLabels: z.ZodArray<z.ZodObject<{
        bulletId: z.ZodString;
        inferredRoles: z.ZodDefault<z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            confidence: z.ZodNumber;
            rationale: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        inferredCompetencies: z.ZodDefault<z.ZodArray<z.ZodObject<{
            competencyId: z.ZodString;
            confidence: z.ZodNumber;
            rationale: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        senioritySignals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    inferredPrimaryRoles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        confidence: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type BulletClassificationResult = z.infer<typeof BulletClassificationResultSchema>;
//# sourceMappingURL=bullets.d.ts.map