# ATS Engine

Model-agnostic ATS engine with:
- **Deterministic core**: LaTeX parsing, strict rubric scoring, evidence mapping, LaTeX patching hooks
- **Pluggable LLM**: `LLMClient` interface with `LocalLLMClient` and `VendorLLMClient`
- **Two modes**:
  - `local`: self-hosted model router
  - `enhanced`: optional vendor model (API key)

## Install

```bash
npm i
```

## Use (library dev)

```bash
npm run dev
```

## Configure mode

### Local (default)

Environment variables:
- `ATS_MODE=local`
- `ATS_LOCAL_ENDPOINT_URL=http://127.0.0.1:4000/ats-llm`
- `ATS_LOCAL_MODEL=...` (optional)

The local endpoint should accept:
`POST { "task": "...", "input": { ... }, "model": "optional" }`
and return:
`{ "output": { ...schema-valid JSON... } }`

### Enhanced (vendor)

Environment variables:
- `ATS_MODE=enhanced`
- `ATS_VENDOR_PROVIDER=openrouter` (or `google_ai_studio`)
- `ATS_VENDOR_ENDPOINT_URL=...` (your vendor router/proxy endpoint)
- `ATS_VENDOR_API_KEY=...`
- `ATS_VENDOR_MODEL=...`

## What’s implemented so far
- `src/llm/LLMClient.ts`: interface
- `src/llm/schemas/*`: strict Zod schemas for JD normalization, bullet classification, rewrites, fit explanation
- `src/core/latex/parseLatex.ts`: minimal LaTeX resume parser (`\\section`, `\\subsection`, `\\item`)
- `src/core/scoring/rubric.ts`: strict deterministic scoring v1
- `src/llm/LocalLLMClient.ts`: local/self-hosted client using a task-router HTTP contract
- `src/llm/VendorLLMClient.ts`: vendor client (same contract, different auth headers)
- `src/config/mode.ts`: env-based mode toggle and client factory

