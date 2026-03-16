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
export declare function postJson<T>(url: string, body: unknown, headers?: Record<string, string>, timeoutMs?: number): Promise<T>;
//# sourceMappingURL=http.d.ts.map