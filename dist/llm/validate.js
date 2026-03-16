export class LLMResponseValidationError extends Error {
    issues;
    constructor(message, issues) {
        super(message);
        this.name = "LLMResponseValidationError";
        this.issues = issues;
    }
}
export function parseWithSchema(schema, value, context) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new LLMResponseValidationError(`Invalid LLM response for ${context}`, parsed.error.issues);
    }
    return parsed.data;
}
//# sourceMappingURL=validate.js.map