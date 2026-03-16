import { LocalLLMClient } from "../llm/LocalLLMClient.js";
import { VendorLLMClient } from "../llm/VendorLLMClient.js";
export function loadConfigFromEnv() {
    const mode = (process.env.ATS_MODE ?? "local");
    const localEndpointUrl = process.env.ATS_LOCAL_ENDPOINT_URL ?? "http://127.0.0.1:4000/ats-llm";
    const localModel = process.env.ATS_LOCAL_MODEL;
    const vendorProvider = process.env.ATS_VENDOR_PROVIDER;
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
export function createLLMClientFromConfig(cfg) {
    if (cfg.mode === "enhanced") {
        if (!cfg.vendorProvider || !cfg.vendorEndpointUrl || !cfg.vendorApiKey || !cfg.vendorModel) {
            throw new Error("ATS enhanced mode requires ATS_VENDOR_PROVIDER, ATS_VENDOR_ENDPOINT_URL, ATS_VENDOR_API_KEY, ATS_VENDOR_MODEL");
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
//# sourceMappingURL=mode.js.map