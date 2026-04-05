import { ROLE_TAXONOMY, COMPETENCY_TAXONOMY } from "./taxonomy.js";
import { BulletClassificationRequestSchema, } from "../../llm/schemas/index.js";
function mergePrimaryRoles(lists) {
    const byId = new Map();
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
export async function inferRolesAndCompetenciesWithLLM(resume, llm) {
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
    const bulletLabels = [];
    const primaryPerChunk = [];
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
    const raw = {
        bulletLabels,
        inferredPrimaryRoles: mergePrimaryRoles(primaryPerChunk),
    };
    return {
        primaryRoles: raw.inferredPrimaryRoles,
        raw,
    };
}
//# sourceMappingURL=classifyWithLLM.js.map