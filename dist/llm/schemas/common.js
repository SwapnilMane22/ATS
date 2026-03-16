import { z } from "zod";
export const BulletIdSchema = z.string().min(1);
export const EvidencePointerSchema = z.object({
    bulletId: BulletIdSchema,
    sectionPath: z.array(z.string().min(1)).default([]),
});
export const ConfidenceSchema = z.number().min(0).max(1);
export const RoleIdSchema = z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_]+$/, "roleId must be a stable identifier (no spaces)");
export const CompetencyIdSchema = z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_]+$/, "competencyId must be a stable identifier (no spaces)");
export const PlainTextSchema = z.string().min(1);
//# sourceMappingURL=common.js.map