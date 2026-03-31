import type { ResumeDocument } from "../resume/types.js";
import type { LLMClient } from "../../llm/LLMClient.js";
import { ROLE_TAXONOMY, COMPETENCY_TAXONOMY } from "./taxonomy.js";
import {
  BulletClassificationRequestSchema,
  type BulletClassificationResult,
} from "../../llm/schemas/index.js";

export interface RoleInferenceSummary {
  primaryRoles: Array<{ roleId: string; confidence: number }>;
  raw: BulletClassificationResult;
}

function mergePrimaryRoles(
  lists: Array<Array<{ roleId: string; confidence: number }>>
): Array<{ roleId: string; confidence: number }> {
  const byId = new Map<string, number>();
  for (const list of lists) {
    for (const r of list) {
      const prev = byId.get(r.roleId) ?? 0;
      byId.set(r.roleId, Math.max(prev, r.confidence));
    }
  }
  return [...byId.entries()]
    .map(([roleId, confidence]) => ({ roleId, confidence }))
    .sort((a, b) => b.confidence - a.confidence);
}

export async function inferRolesAndCompetenciesWithLLM(
  resume: ResumeDocument,
  llm: LLMClient
): Promise<RoleInferenceSummary> {
  const knownRoles = ROLE_TAXONOMY.map((r) => ({
    roleId: r.roleId,
    label: r.label,
    description: r.description,
  }));
  const knownCompetencies = COMPETENCY_TAXONOMY.map((c) => ({
    competencyId: c.competencyId,
    label: c.label,
    description: c.description,
  }));

  const bullets = resume.bullets.map((b) => ({
    bulletId: b.bulletId,
    text: b.text,
    sectionPath: b.sectionPath,
    jobTitle: b.meta?.jobTitle,
    company: b.meta?.company,
    startDate: b.meta?.startDate,
    endDate: b.meta?.endDate,
  }));

  const chunkSize = Math.max(1, Math.floor(Number(process.env.ATS_BULLET_CHUNK_SIZE ?? "12")));

  if (bullets.length <= chunkSize) {
    const req = BulletClassificationRequestSchema.parse({
      bullets,
      knownRoles,
      knownCompetencies,
    });
    const result = await llm.classifyBulletsToCompetencies(req);
    return {
      primaryRoles: result.inferredPrimaryRoles,
      raw: result,
    };
  }

  const bulletLabels: BulletClassificationResult["bulletLabels"] = [];
  const primaryPerChunk: Array<Array<{ roleId: string; confidence: number }>> = [];

  for (let i = 0; i < bullets.length; i += chunkSize) {
    const slice = bullets.slice(i, i + chunkSize);
    const req = BulletClassificationRequestSchema.parse({
      bullets: slice,
      knownRoles,
      knownCompetencies,
    });
    const part = await llm.classifyBulletsToCompetencies(req);
    bulletLabels.push(...part.bulletLabels);
    primaryPerChunk.push(part.inferredPrimaryRoles);
  }

  const raw: BulletClassificationResult = {
    bulletLabels,
    inferredPrimaryRoles: mergePrimaryRoles(primaryPerChunk),
  };

  return {
    primaryRoles: raw.inferredPrimaryRoles,
    raw,
  };
}

