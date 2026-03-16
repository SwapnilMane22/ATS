import type { ResumeDocument } from "../resume/types.js";
import type { LLMClient } from "../../llm/LLMClient.js";
import { type BulletClassificationResult } from "../../llm/schemas/index.js";
export interface RoleInferenceSummary {
    primaryRoles: Array<{
        roleId: string;
        confidence: number;
    }>;
    raw: BulletClassificationResult;
}
export declare function inferRolesAndCompetenciesWithLLM(resume: ResumeDocument, llm: LLMClient): Promise<RoleInferenceSummary>;
//# sourceMappingURL=classifyWithLLM.d.ts.map