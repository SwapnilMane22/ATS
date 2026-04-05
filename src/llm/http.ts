export interface JsonRpcLikeRequest {
  /** Free-form model identifier for the upstream server. */
  model?: string | undefined;
  /** Task name so the server can route prompts/templates. */
  task: string;
  /** Payload for the task. */
  input: unknown;
}

export interface JsonRpcLikeResponse {
  output: unknown;
  raw?: unknown;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 60_000
): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Connection": "close",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

