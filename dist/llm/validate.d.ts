import { z } from "zod";
export declare class LLMResponseValidationError extends Error {
    readonly issues: z.ZodIssue[];
    constructor(message: string, issues: z.ZodIssue[]);
}
export declare function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, context: string): T;
//# sourceMappingURL=validate.d.ts.map