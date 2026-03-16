import { FitExplanationRequestSchema, } from "../../llm/schemas/index.js";
export async function explainStrictJdFitWithLLM(resume, jd, llm) {
    const req = FitExplanationRequestSchema.parse({
        resume: {
            bullets: resume.bullets.map((b) => ({
                bulletId: b.bulletId,
                text: b.text,
                sectionPath: b.sectionPath,
            })),
        },
        jd,
    });
    const fit = await llm.explainFit(req);
    return { jd, fit };
}
//# sourceMappingURL=fitWithLLM.js.map