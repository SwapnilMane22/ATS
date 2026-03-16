import type { ResumeDocument } from "../resume/types.js";
import type { LLMClient } from "../../llm/LLMClient.js";
import { type FitExplanationResult, type JdNormalized } from "../../llm/schemas/index.js";
export interface StrictJdFitResult {
    jd: JdNormalized;
    fit: FitExplanationResult;
}
export declare function explainStrictJdFitWithLLM(resume: ResumeDocument, jd: JdNormalized, llm: LLMClient): Promise<StrictJdFitResult>;
//# sourceMappingURL=fitWithLLM.d.ts.map