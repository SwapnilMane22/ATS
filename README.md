# ATS Engine

ATS Engine is a resume scoring and JD-fit analysis system designed with a **deterministic core + optional LLM enrichment**.

## Current design (simplified)

The runtime design is now intentionally simple:

- **Primary LLM path:** local **Ollama** (`ATS_MODE=local`)
- **Optional fallback path:** **portfolio-backend LLM client** (OpenRouter/Gemini) when local fails and keys exist
- **No local task-router mode in active flow**

This matches your goal: **Ollama first, portfolio fallback optionally, nothing else in the normal path**.

## System design

1. Input parsing
- Parse LaTeX resume into `sections` + `bullets` with stable `bulletId`s.
- File: `src/core/latex/parseLatex.ts`

2. Deterministic ATS scoring
- Structure + bullet-quality rubric (sections, action verbs, metrics, weak-verb penalty).
- File: `src/core/scoring/rubric.ts`

3. Optional LLM enrichment
- Role/competency classification from bullets.
- JD normalization and JD-fit explanation.
- Files: `src/core/roles/classifyWithLLM.ts`, `src/core/jd/fitWithLLM.ts`

4. Optional deterministic JD fit (no LLM)
- Keyword-overlap style coverage against JD text.
- File: `src/core/jd/fitDeterministic.ts`

## Semantic matching status (important)

Are we doing semantic resume↔JD matching already?

- **With LLM + JD:** **Yes (partially semantic)**  
  `fitWithLLM` uses normalized JD requirements + evidence mapping from bullets. This is semantic-ish because the model reasons over meaning and not only exact keywords.

- **Without LLM + JD:** **No (not truly semantic)**  
  `fitDeterministic` is currently keyword-overlap based. It is useful and fast, but not deep semantic matching.

If you want stronger semantic matching without cloud APIs, next step is local embeddings + vector similarity (Ollama embeddings model) for requirement-to-bullet matching.

## Design principles

- Deterministic baseline first
- Strict schema validation for every LLM output (`zod`)
- Evidence-driven outputs (bullet IDs / coverage artifacts)
- Local-first operation (Ollama)
- Fallback for resilience (portfolio OpenRouter/Gemini client)

## Tech stack

- TypeScript (Node)
- `zod` schemas for strict output validation
- Ollama local inference (`/api/chat`)
- Portfolio shared LLM client (`portfolio-backend/llm`) for fallback

## Real-world usability

Why this is already useful for real job applications:

- Fast baseline score without model calls
- Repeatable outputs and explicit gates
- JD-fit explanation with requirement coverage (LLM mode)
- Can run fully local with Ollama

## Drawbacks and gap vs Workday/Greenhouse ATS

This engine is strong for personal optimization, but it is **not equivalent** to enterprise ATS stacks yet.

Current gaps:

- No parsing for DOCX/PDF production variance at enterprise scale
- No company-specific screening rule packs
- No recruiter workflow integration, candidate pipeline state, audit, permissions
- Deterministic no-LLM JD fit is keyword-based (not deep semantic)
- Limited anti-gaming and calibration dataset coverage

Will it fail vs industry ATS in some cases? **Yes**, especially on edge document formats and enterprise-specific screening logic.

## Path to industry-grade proficiency

1. Add robust multi-format parser (PDF/DOCX) + normalization
2. Add local embedding-based semantic matcher (requirement↔bullet similarity)
3. Add benchmark set (100+ resumes/JDs) and track precision/recall for match decisions
4. Add evaluation harness comparing deterministic vs LLM vs hybrid outputs
5. Add explainability artifacts per score decision (already partly present)

## Install

```bash
npm i
```

## Environment setup

### Local-first (recommended)

```bash
export ATS_MODE=local
export ATS_LOCAL_MODEL=qwen2.5:14b-instruct
export ATS_OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Optional fallback to portfolio-backed providers:

```bash
export ATS_LOCAL_FALLBACK_PORTFOLIO=1
export OPENROUTER_API_KEY="..."
export GEMINI_API_KEY="..."
```

### Portfolio-only mode (no local model)

```bash
export ATS_MODE=portfolio
```

Uses same env names as portfolio backend:
- `OPENROUTER_API_KEY`, `OPENROUTER_API_BASE_URL`, `CHAT_MODELS` / `CHAT_MODEL`
- `GEMINI_API_KEY`, `GEMINI_MODELS` / `GEMINI_MODEL`

## 4 test commands

Run from `ATS Engine` root.  
Example resume path: `../portfolio/backend/data/main.tex`

1) Score resume **without JD, without LLM**
```bash
npm run ats -- --resume ../portfolio/backend/data/main.tex --skip-llm --out report_nojd_nollm.json
```

2) Score resume **without JD, with LLM**
```bash
ATS_MODE=local ATS_LOCAL_MODEL=qwen2.5-coder:7b npm run ats -- --resume ../portfolio/backend/data/main.tex --out report_nojd_llm.json
```

3) Score resume **with JD, without LLM**
```bash
npm run ats -- --resume ../portfolio/backend/data/main.tex --jd ./sampleJD/InfraAI.txt --skip-llm --out report_jd_nollm.json
```

4) Score resume **with JD, with LLM**
```bash
ATS_MODE=local ATS_LOCAL_MODEL=qwen2.5-coder:7b npm run ats -- --resume ../portfolio/backend/data/main.tex --jd ./sampleJD/InfraAI.txt --out report_jd_llm.json
```

All scoring reports are written under `ATS Engine/reports/`.  
If `--out` is provided, only the filename is used and it is saved inside `reports/`.

## Operational notes

- For debugging model routing/errors:
  - `ATS_DEBUG_LLM=1`
- For larger outputs:
  - `ATS_MAX_TOKENS` (default `16384`)
  - `ATS_BULLET_CHUNK_SIZE` (default `12`)
  - `ATS_OLLAMA_TIMEOUT_MS` (default `300000`) for slower local models

