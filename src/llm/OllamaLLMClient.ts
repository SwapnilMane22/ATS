import { AbstractLLMClient } from "./AbstractLLMClient.js";
import { postJson } from "./http.js";
import { extractJsonValue } from "./extractJson.js";

interface OllamaChatResponse {
  message?: { content?: string };
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

export interface OllamaLLMClientOptions {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}

export class OllamaLLMClient extends AbstractLLMClient {
  readonly kind = "local" as const;
  readonly name: string;

  private readonly url: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: OllamaLLMClientOptions) {
    super();
    const base = (opts.baseUrl ?? process.env.ATS_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(
      /\/$/,
      ""
    );
    this.baseUrl = base;
    this.url = `${base}/api/chat`;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.ATS_OLLAMA_TIMEOUT_MS ?? "300000");
    this.name = `OllamaLLM(${this.model})`;
  }

  private fallbackModelsFromEnv(): string[] {
    const raw = process.env.ATS_OLLAMA_FALLBACK_MODELS;
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async resolveModelCandidates(): Promise<string[]> {
    const ordered = [this.model, ...this.fallbackModelsFromEnv()];
    const unique = [...new Set(ordered)];
    if (unique.length <= 1) return unique;
    try {
      const tagsRes = await fetch(`${this.baseUrl}/api/tags`, {
          method: "GET",
          headers: { "Connection": "close" }
      });
      if (!tagsRes.ok) return unique;
      const tags = (await tagsRes.json()) as OllamaTagsResponse;
      const installed = new Set((tags.models ?? []).map((m) => m.name).filter(Boolean) as string[]);
      const installedPreferred = unique.filter((m) => installed.has(m));
      if (installedPreferred.length > 0) return installedPreferred;
      return unique;
    } catch {
      return unique;
    }
  }

  protected async completeJson(system: string, user: string): Promise<unknown> {
    const models = await this.resolveModelCandidates();
    let lastErr: unknown;
    for (const model of models) {
      const body = {
        model,
        stream: false,
        format: "json",
        options: {
          temperature: Number(process.env.ATS_TEMPERATURE ?? "0.2"),
          num_ctx: 8192,
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
      const timeouts = [this.timeoutMs, this.timeoutMs * 2];
      for (let attempt = 0; attempt < timeouts.length; attempt += 1) {
        try {
          const res = await postJson<OllamaChatResponse>(
            this.url,
            body,
            {},
            timeouts[attempt]!
          );
          const text = res.message?.content;
          if (!text || !text.trim()) {
            throw new Error("Ollama returned empty response content");
          }
          return extractJsonValue(text);
        } catch (e) {
          lastErr = e;
          const isAbort =
            (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message))) ||
            String(e).includes("AbortError");
          if (!(isAbort && attempt < timeouts.length - 1)) {
            break;
          }
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Ollama request failed for all candidate models");
  }
}
