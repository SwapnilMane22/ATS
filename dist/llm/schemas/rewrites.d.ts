import { z } from "zod";
export declare const BulletRewriteConstraintsSchema: z.ZodObject<{
    style: z.ZodDefault<z.ZodEnum<{
        concise_impact_first: "concise_impact_first";
        technical_detail: "technical_detail";
        leadership: "leadership";
    }>>;
    maxChars: z.ZodDefault<z.ZodNumber>;
    forbidFabrication: z.ZodDefault<z.ZodBoolean>;
    preserveTech: z.ZodDefault<z.ZodBoolean>;
    allowMetricPlaceholders: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type BulletRewriteConstraints = z.infer<typeof BulletRewriteConstraintsSchema>;
export declare const BulletRewriteRequestSchema: z.ZodObject<{
    bullets: z.ZodArray<z.ZodObject<{
        bulletId: z.ZodString;
        text: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            bulletId: z.ZodString;
            sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    constraints: z.ZodDefault<z.ZodObject<{
        style: z.ZodDefault<z.ZodEnum<{
            concise_impact_first: "concise_impact_first";
            technical_detail: "technical_detail";
            leadership: "leadership";
        }>>;
        maxChars: z.ZodDefault<z.ZodNumber>;
        forbidFabrication: z.ZodDefault<z.ZodBoolean>;
        preserveTech: z.ZodDefault<z.ZodBoolean>;
        allowMetricPlaceholders: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    jobContext: z.ZodOptional<z.ZodObject<{
        targetRoleTitle: z.ZodOptional<z.ZodString>;
        seniority: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BulletRewriteRequest = z.infer<typeof BulletRewriteRequestSchema>;
export declare const BulletRewriteVariantSchema: z.ZodObject<{
    bulletId: z.ZodString;
    variantId: z.ZodString;
    text: z.ZodString;
    notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    usedPlaceholders: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type BulletRewriteVariant = z.infer<typeof BulletRewriteVariantSchema>;
export declare const BulletRewriteResultSchema: z.ZodObject<{
    variants: z.ZodArray<z.ZodObject<{
        bulletId: z.ZodString;
        variantId: z.ZodString;
        text: z.ZodString;
        notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
        usedPlaceholders: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BulletRewriteResult = z.infer<typeof BulletRewriteResultSchema>;
//# sourceMappingURL=rewrites.d.ts.map