import { z } from "zod";
export declare const BulletIdSchema: z.ZodString;
export type BulletId = z.infer<typeof BulletIdSchema>;
export declare const EvidencePointerSchema: z.ZodObject<{
    bulletId: z.ZodString;
    sectionPath: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;
export declare const ConfidenceSchema: z.ZodNumber;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export declare const RoleIdSchema: z.ZodString;
export type RoleId = z.infer<typeof RoleIdSchema>;
export declare const CompetencyIdSchema: z.ZodString;
export type CompetencyId = z.infer<typeof CompetencyIdSchema>;
export declare const PlainTextSchema: z.ZodString;
//# sourceMappingURL=common.d.ts.map