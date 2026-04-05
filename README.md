# ATS Engine

Resume scoring and job-description fit analysis with a **deterministic core**, optional **local Ollama** LLM calls, and optional **cloud fallback** (OpenRouter / Gemini via `portfolio-backend`).

---

## Contents

1. [Quick start](#quick-start)
2. [How it works](#how-it-works)
3. [Commands](#commands)
4. [Configuration](#configuration)
5. [Web UI and HTTP API](#web-ui-and-http-api)
6. [Portfolio paths and candidate name](#portfolio-paths-and-candidate-name)
7. [Ollama models](#ollama-models)
8. [CLI examples](#cli-examples)
9. [Reports, policy, and calibration](#reports-policy-and-calibration)
10. [Evaluation harness](#evaluation-harness)
11. [Troubleshooting](#troubleshooting)
12. [Limits vs enterprise ATS](#limits-vs-enterprise-ats)

---

## Quick start

```bash
cd "ATS Engine"
npm install
cp .env.example .env   # edit paths + ATS_LOCAL_MODEL if needed
ollama serve           # separate terminal; pull the default local model: ollama pull gemma4:26b
npm run ui:build       # build the local web UI (required after UI changes)
npm run ats:serve      # API + UI at http://127.0.0.1:3847
```

Optional: copy `portfolio/backend/.env.example` → `portfolio/backend/.env` and set `PORTFOLIO_DATA_DIR` so the portfolio chatbot uses the same `knowledge.json` folder as ATS.

---

## How it works

| Layer | Role | Main code |
|--------|------|-----------|
| Parse | LaTeX → sections + bullets (`bulletId`) | `src/core/latex/parseLatex.ts` |
| Score | Deterministic rubric (structure, verbs, metrics) | `src/core/scoring/rubric.ts` |
| JD (no LLM) | Keyword-style coverage | `src/core/jd/fitDeterministic.ts` |
| JD (semantic) | Embeddings similarity (when enabled) | `src/core/jd/semanticFit.ts` |
| LLM | Normalize JD, classify bullets, explain fit, suggest rewrites | `src/core/roles/`, `src/core/jd/`, `src/llm/` |
| Tailoring | Safe rewrites + optional `pdflatex` PDF | `src/core/tailor/`, `src/core/assets/tailoredResumeWriter.ts` |

**Modes** (`ATS_MODE`):

- **`local`** (default): **Ollama** primary (`OllamaLLMClient`). Optional **portfolio** fallback if `ATS_LOCAL_FALLBACK_PORTFOLIO` is on and API keys exist (`FallbackLLMClient`).
- **`portfolio`**: cloud only (`PortfolioLLMClient`).

**Design principles:** deterministic baseline first, `zod` validation on LLM JSON, evidence tied to bullet IDs, local-first with optional cloud resilience.

---

## Commands

| Script | Purpose |
|--------|---------|
| `npm run ats:serve` | HTTP server: UI static files + `/api/*` (default port **3847**) |
| `npm run ats` | CLI: `tsx src/cli/run.ts` — see [CLI examples](#cli-examples) |
| `npm run ats:local` | CLI with `ATS_MODE=local` |
| `npm run ats:portfolio` | CLI with `ATS_MODE=portfolio` |
| `npm run ats:evaluate` | Batch evaluation on `eval/datasets/*.jsonl` |
| `npm run ui:build` | Production-build Vite UI into `ui/dist` |
| `npm run build` | TypeScript compile (`tsc`) |
| `npm run typecheck` | `tsc --noEmit` |

---

## Configuration

### `.env` loading

`src/loadEnv.ts` loads **`ATS Engine/.env`** with **`override: true`** so values in `.env` beat stray shell exports (e.g. an old `ATS_LOCAL_MODEL` in your profile). Logging from dotenv is suppressed (`quiet: true`).

### Environment variables (reference)

| Variable | Purpose |
|----------|---------|
| `PORTFOLIO_DATA_DIR` | Absolute path to folder containing `main.tex` and `knowledge.json` |
| `ATS_DEFAULT_RESUME` | Optional full path to `.tex` (overrides default `main.tex` under `PORTFOLIO_DATA_DIR`) |
| `ATS_LOCAL_MODEL` | Ollama model tag (must exist in `ollama list`) |
| `ATS_OLLAMA_BASE_URL` | Default `http://127.0.0.1:11434` |
| `ATS_OLLAMA_TIMEOUT_MS` | Default `300000` |
| `ATS_OLLAMA_FALLBACK_MODELS` | Comma-separated fallbacks if primary missing |
| `ATS_MODE` | `local` or `portfolio` |
| `ATS_LOCAL_FALLBACK_PORTFOLIO` | `1` / `0` — use OpenRouter/Gemini when local fails |
| `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, … | Same as portfolio backend for fallback |
| `ATS_USER_FIRST_NAME`, `ATS_USER_LAST_NAME` | Optional override for tailoring name |
| `ATS_SERVER_PORT` | Default `3847` |
| `ATS_PDFLATEX` | Optional **full path** to `pdflatex` if the server cannot find it (e.g. GUI/IDE missing shell `PATH`) |
| `ATS_DEBUG_LLM`, `ATS_MAX_TOKENS`, `ATS_TEMPERATURE`, `ATS_BULLET_CHUNK_SIZE`, `ATS_LLM_FIT_PASSES` | Operational tuning |

---

## Web UI and HTTP API

- **UI:** served from `ui/dist` when you run `npm run ats:serve`. After changing `ui/src`, run **`npm run ui:build`** and hard-refresh the browser (or use Vite dev server separately if you add one).
- **Candidate name** is shown from config (no manual first/last fields); sourced from `knowledge.json` / `main.tex` (see below).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | `{ ok, service, port }` |
| GET | `/api/config` | Paths, **runtime** (Ollama, model pulled, fallback), **candidate name** |
| GET | `/api/status` | Runtime only (no portfolio paths) |
| POST | `/api/analyze` | Body: `jdText`, optional `resumePath`, `company`, `jobRole`, `skipLlm`, … |
| POST | `/api/save-tweaked` | Save generated TeX under `assets/latex` |

---

## Portfolio paths and candidate name

- Default layout assumes a sibling repo: **`../portfolio/backend/data/`** with `main.tex` and `knowledge.json`.
- Override with **`PORTFOLIO_DATA_DIR`** (set on both ATS Engine and `portfolio/backend` for consistency).
- **Candidate name** for tailored output: `resolveCandidateName()` in `src/candidateIdentity.ts` — prefers **`about.name`** in `knowledge.json`, else first `\textbf{{...}}` name in the LaTeX header. CLI can still pass **`--first-name` / `--last-name`**; env **`ATS_USER_*`** overrides.

---

## Ollama models

There is no separate “reasoning mode” flag: quality follows **`ATS_LOCAL_MODEL`** and optional **`ATS_OLLAMA_FALLBACK_MODELS`**. All LLM calls request JSON from Ollama (`format: "json"`).

| Goal | Examples |
|------|----------|
| **Default (recommended)** | `gemma4:26b` — Gemma 4 26B MoE (Ollama); large context, strong for JD/resume JSON tasks |
| Lighter / faster | `qwen2.5:7b-instruct`, `qwen2.5:14b-instruct` |
| Code-heavy side tasks only | `qwen2.5-coder:7b` — weaker on strict JSON; not preferred for ATS pipelines |
| Reasoning-style (often slower) | `deepseek-r1:8b` (tags vary; check `ollama library`) |

**Hardware:** Apple Silicon (e.g. M3 Pro) is comfortable with **7B–14B**; NVIDIA laptops often allow **larger** quantizations. Use `ollama list` to confirm what is installed.

---

## CLI examples

Run from `ATS Engine` root. Reports go under **`reports/`** (filename from `--out`).

| Scenario | Command |
|----------|---------|
| Resume only, no LLM | `npm run ats -- --resume ../portfolio/backend/data/main.tex --skip-llm --out report_nojd_nollm.json` |
| Resume + LLM | `npm run ats -- --resume ../portfolio/backend/data/main.tex --out report_nojd_llm.json` |
| Resume + JD file, no LLM | `npm run ats -- --resume ../portfolio/backend/data/main.tex --jd ./sampleJD/InfraAI.txt --skip-llm --out report_jd_nollm.json` |
| Full pipeline | `npm run ats -- --resume ../portfolio/backend/data/main.tex --jd ./sampleJD/InfraAI.txt --out report_jd_llm.json` |

JD text can be passed inline for the server/UI; CLI expects a file for `--jd`.

---

## Reports, policy, and calibration

- **Policy file:** `config/scoring-policy.v1.json` (override path: `ATS_SCORING_POLICY_PATH`).
- Reports include policy metadata, `opportunityAssessment` (band, confidence, uncertainty), `decisionTrace`, multi-pass LLM summaries where applicable, and `complianceAudit` flags.

---

## Evaluation harness

```bash
npm run ats:evaluate -- --input eval/datasets/applications.jsonl --out reports/eval_summary.json
```

Dataset format: `eval/datasets/applications.jsonl` with fields such as `applicationId`, `candidateId`, `jdId`, scores, `outcome`.

---

## Troubleshooting

| Symptom | What to do |
|---------|------------|
| **`◇ injecting env (N) from .env`** in the terminal | **Informational** (dotenv). Suppressed in code via `quiet: true`. Not a failure. |
| **`HTTP 404` / model not found** from Ollama | Set `ATS_LOCAL_MODEL` in `.env` to a model from `ollama list`, or run `ollama pull <model>`. |
| **`412` or failed pull for `gemma4:26b`** | Upgrade **Ollama** to **0.20+** (Gemma 4 needs a recent client). Then `ollama pull gemma4:26b` again. |
| **UI still shows old fields (e.g. first/last name)** | Run **`npm run ui:build`**, restart `ats:serve`, hard-refresh the browser. |
| **Stale env vars** | `.env` uses **override**; restart the server after editing `.env`. |
| **Analysis hangs on “Running…”** | Large models or long JDs take time; raise `ATS_OLLAMA_TIMEOUT_MS` if needed. Check **Engine status** on the UI for Ollama reachability. |
| **`spawn tectonic ENOENT` or empty PDF panes** | The Node process cannot find the `tectonic` executable. Install it via `brew install tectonic` on macOS, **restart** `ats:serve`, or set **`ATS_TECTONIC_PATH=/opt/homebrew/bin/tectonic`** in `ATS Engine/.env`. |

---

## Limits vs enterprise ATS

Useful for personal optimization and repeatable scoring; **not** a drop-in replacement for Workday/Greenhouse-style ATS: limited DOCX/PDF variance handling, no employer-specific rule packs, no recruiter workflow or permissions model. See codebase comments for semantic-matching roadmap (e.g. stronger local embeddings).
