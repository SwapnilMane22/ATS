import type { LLMClient } from "../llm/LLMClient.js";
import { type VendorProvider } from "../llm/VendorLLMClient.js";
export type AtsMode = "local" | "enhanced";
export interface AtsEngineConfig {
    mode: AtsMode;
    /**
     * Local router endpoint, e.g. `http://127.0.0.1:4000/ats-llm`.
     * The router is responsible for turning task+input into strict JSON outputs.
     */
    localEndpointUrl: string;
    localModel?: string | undefined;
    vendorProvider?: VendorProvider | undefined;
    vendorEndpointUrl?: string | undefined;
    vendorApiKey?: string | undefined;
    vendorModel?: string | undefined;
}
export declare function loadConfigFromEnv(): AtsEngineConfig;
export declare function createLLMClientFromConfig(cfg: AtsEngineConfig): LLMClient;
//# sourceMappingURL=mode.d.ts.map