import { z } from "zod";

export class LLMResponseValidationError extends Error {
  readonly issues: z.ZodIssue[];
  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = "LLMResponseValidationError";
    this.issues = issues;
  }
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: string
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new LLMResponseValidationError(
      `Invalid LLM response for ${context}`,
      parsed.error.issues
    );
  }
  return parsed.data;
}

