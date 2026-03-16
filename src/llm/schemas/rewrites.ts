import { z } from "zod";
import {
  BulletIdSchema,
  EvidencePointerSchema,
  PlainTextSchema,
} from "./common.js";

export const BulletRewriteConstraintsSchema = z.object({
  style: z
    .enum(["concise_impact_first", "technical_detail", "leadership"])
    .default("concise_impact_first"),
  maxChars: z.number().int().min(60).max(400).default(240),
  forbidFabrication: z.boolean().default(true),
  preserveTech: z.boolean().default(true),
  allowMetricPlaceholders: z.boolean().default(true),
});
export type BulletRewriteConstraints = z.infer<
  typeof BulletRewriteConstraintsSchema
>;

export const BulletRewriteRequestSchema = z.object({
  bullets: z
    .array(
      z.object({
        bulletId: BulletIdSchema,
        text: PlainTextSchema,
        evidence: z.array(EvidencePointerSchema).default([]),
      })
    )
    .min(1),
  constraints: BulletRewriteConstraintsSchema.default(() => ({
    style: "concise_impact_first" as const,
    maxChars: 240,
    forbidFabrication: true,
    preserveTech: true,
    allowMetricPlaceholders: true,
  })),
  jobContext: z
    .object({
      targetRoleTitle: z.string().min(1).optional(),
      seniority: z.string().min(1).optional(),
    })
    .optional(),
});
export type BulletRewriteRequest = z.infer<typeof BulletRewriteRequestSchema>;

export const BulletRewriteVariantSchema = z.object({
  bulletId: BulletIdSchema,
  variantId: z.string().min(1),
  text: z.string().min(1),
  notes: z.array(z.string().min(1)).default([]),
  usedPlaceholders: z.boolean().default(false),
});
export type BulletRewriteVariant = z.infer<typeof BulletRewriteVariantSchema>;

export const BulletRewriteResultSchema = z.object({
  variants: z.array(BulletRewriteVariantSchema).min(1),
});
export type BulletRewriteResult = z.infer<typeof BulletRewriteResultSchema>;

