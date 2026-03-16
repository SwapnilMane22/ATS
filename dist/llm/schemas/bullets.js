import { z } from "zod";
import { BulletIdSchema, CompetencyIdSchema, ConfidenceSchema, PlainTextSchema, RoleIdSchema, } from "./common.js";
export const BulletInputSchema = z.object({
    bulletId: BulletIdSchema,
    text: PlainTextSchema,
    sectionPath: z.array(z.string().min(1)).default([]),
    jobTitle: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).optional(),
});
export const BulletClassificationRequestSchema = z.object({
    bullets: z.array(BulletInputSchema).min(1),
    knownRoles: z
        .array(z.object({
        roleId: RoleIdSchema,
        label: z.string().min(1),
        description: z.string().min(1).optional(),
    }))
        .default([]),
    knownCompetencies: z
        .array(z.object({
        competencyId: CompetencyIdSchema,
        label: z.string().min(1),
        description: z.string().min(1).optional(),
    }))
        .default([]),
});
export const BulletLabelSchema = z.object({
    bulletId: BulletIdSchema,
    inferredRoles: z
        .array(z.object({
        roleId: RoleIdSchema,
        confidence: ConfidenceSchema,
        rationale: z.string().min(1).optional(),
    }))
        .default([]),
    inferredCompetencies: z
        .array(z.object({
        competencyId: CompetencyIdSchema,
        confidence: ConfidenceSchema,
        rationale: z.string().min(1).optional(),
    }))
        .default([]),
    senioritySignals: z.array(z.string().min(1)).default([]),
});
export const BulletClassificationResultSchema = z.object({
    bulletLabels: z.array(BulletLabelSchema).min(1),
    inferredPrimaryRoles: z
        .array(z.object({
        roleId: RoleIdSchema,
        confidence: ConfidenceSchema,
    }))
        .default([]),
});
//# sourceMappingURL=bullets.js.map