declare module "portfolio-backend/llm" {
  export function chatCompletion(
    messages: Array<{ role: string; content: string }>,
    apiKey: string,
    baseURL?: string,
    model?: string,
    options?: { maxTokens?: number; temperature?: number; responseFormatJson?: boolean }
  ): Promise<string>;

  export function chatCompletionGemini(
    messages: Array<{ role: string; content: string }>,
    apiKey: string,
    model?: string,
    options?: { maxTokens?: number; temperature?: number; responseMimeType?: string }
  ): Promise<string>;
}
