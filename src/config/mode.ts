import type { LLMClient } from "../llm/LLMClient.js";
import { LocalLLMClient } from "../llm/LocalLLMClient.js";
import { VendorLLMClient, type VendorProvider } from "../llm/VendorLLMClient.js";

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

export function loadConfigFromEnv(): AtsEngineConfig {
  const mode = (process.env.ATS_MODE ?? "local") as AtsMode;

  const localEndpointUrl = process.env.ATS_LOCAL_ENDPOINT_URL ?? "http://127.0.0.1:4000/ats-llm";
  const localModel = process.env.ATS_LOCAL_MODEL;

  const vendorProvider = process.env.ATS_VENDOR_PROVIDER as VendorProvider | undefined;
  const vendorEndpointUrl = process.env.ATS_VENDOR_ENDPOINT_URL;
  const vendorApiKey = process.env.ATS_VENDOR_API_KEY;
  const vendorModel = process.env.ATS_VENDOR_MODEL;

  return {
    mode,
    localEndpointUrl,
    localModel,
    vendorProvider,
    vendorEndpointUrl,
    vendorApiKey,
    vendorModel,
  };
}

export function createLLMClientFromConfig(cfg: AtsEngineConfig): LLMClient {
  if (cfg.mode === "enhanced") {
    if (!cfg.vendorProvider || !cfg.vendorEndpointUrl || !cfg.vendorApiKey || !cfg.vendorModel) {
      throw new Error(
        "ATS enhanced mode requires ATS_VENDOR_PROVIDER, ATS_VENDOR_ENDPOINT_URL, ATS_VENDOR_API_KEY, ATS_VENDOR_MODEL"
      );
    }
    return new VendorLLMClient({
      provider: cfg.vendorProvider,
      endpointUrl: cfg.vendorEndpointUrl,
      apiKey: cfg.vendorApiKey,
      model: cfg.vendorModel,
    });
  }

  return new LocalLLMClient({
    endpointUrl: cfg.localEndpointUrl,
  });
}

