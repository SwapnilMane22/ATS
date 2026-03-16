import { ROLE_TAXONOMY, COMPETENCY_TAXONOMY } from "./taxonomy.js";
import { BulletClassificationRequestSchema, } from "../../llm/schemas/index.js";
export async function inferRolesAndCompetenciesWithLLM(resume, llm) {
    const req = BulletClassificationRequestSchema.parse({
        bullets: resume.bullets.map((b) => ({
            bulletId: b.bulletId,
            text: b.text,
            sectionPath: b.sectionPath,
            jobTitle: b.meta?.jobTitle,
            company: b.meta?.company,
            startDate: b.meta?.startDate,
            endDate: b.meta?.endDate,
        })),
        knownRoles: ROLE_TAXONOMY.map((r) => ({
            roleId: r.roleId,
            label: r.label,
            description: r.description,
        })),
        knownCompetencies: COMPETENCY_TAXONOMY.map((c) => ({
            competencyId: c.competencyId,
            label: c.label,
            description: c.description,
        })),
    });
    const result = await llm.classifyBulletsToCompetencies(req);
    return {
        primaryRoles: result.inferredPrimaryRoles,
        raw: result,
    };
}
//# sourceMappingURL=classifyWithLLM.js.map