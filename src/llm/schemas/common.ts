import { z } from "zod";

export const BulletIdSchema = z.string().min(1);
export type BulletId = z.infer<typeof BulletIdSchema>;

export const EvidencePointerSchema = z.object({
  bulletId: BulletIdSchema,
  sectionPath: z.array(z.string().min(1)).default([]),
});
export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;

export const ConfidenceSchema = z.number().min(0).max(1);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const RoleIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_]+$/, "roleId must be a stable identifier (no spaces)");
export type RoleId = z.infer<typeof RoleIdSchema>;

export const CompetencyIdSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9_]+$/,
    "competencyId must be a stable identifier (no spaces)"
  );
export type CompetencyId = z.infer<typeof CompetencyIdSchema>;

export const PlainTextSchema = z.string().min(1);

