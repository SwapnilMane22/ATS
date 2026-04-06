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

import http from "node:http";
import https from "node:https";

export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 60_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const options = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(data.length),
        ...headers,
      },
    };
    const req = (parsedUrl.protocol === "https:" ? https : http).request(parsedUrl, options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk as Buffer));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}: ${text}`));
        } else {
          try {
            resolve(JSON.parse(text) as T);
          } catch (e) {
            reject(new Error(`Failed to parse JSON response (${res.statusCode}): ${text}`));
          }
        }
      });
    });
    req.on("error", (e) => reject(e));
    req.write(data);
    req.end();
  });
}

