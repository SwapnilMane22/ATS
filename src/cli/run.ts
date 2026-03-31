/**
 * End-to-end ATS run: parse LaTeX resume, deterministic score, optional JD + LLM (portfolio mode).
 *
 * Usage:
 *   ATS_MODE=portfolio OPENROUTER_API_KEY=... npx tsx src/cli/run.ts --resume ./resume.tex [--jd ./jd.txt] [--out ./report.json]
 *   npx tsx src/cli/run.ts --resume ./resume.tex --skip-llm
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createLLMClientFromConfig, loadConfigFromEnv } from "../config/mode.js";
import { parseLatexResume } from "../core/latex/parseLatex.js";
import { scoreJdFitDeterministic } from "../core/jd/fitDeterministic.js";
import { scoreJdFitSemanticWithEmbeddings } from "../core/jd/semanticFit.js";
import { scoreResumeDeterministic } from "../core/scoring/rubric.js";
import { inferRolesAndCompetenciesWithLLM } from "../core/roles/classifyWithLLM.js";
import { explainStrictJdFitWithLLM } from "../core/jd/fitWithLLM.js";
import { JdRawInputSchema } from "../llm/schemas/index.js";

/**
 * Resolve a user-supplied path when the file is not under cwd (e.g. run from
 * `ATS Engine/` but pass `portfolio/backend/data/main.tex` meaning sibling `../portfolio/...`).
 */
async function resolveExistingFile(
  userPath: string,
  label: string
): Promise<string> {
  const cwd = process.cwd();
  const candidates: string[] = [];
  if (path.isAbsolute(userPath)) {
    candidates.push(path.normalize(userPath));
  } else {
    candidates.push(path.resolve(cwd, userPath));
    candidates.push(path.resolve(cwd, "..", userPath));
    candidates.push(path.resolve(cwd, "..", "..", userPath));
  }
  const seen = new Set<string>();
  for (const p of candidates) {
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `${label} not found. Tried:\n${[...seen].map((x) => `  - ${x}`).join("\n")}\n` +
      `Hint: use an absolute path, or a path relative to this folder (e.g. ../portfolio/backend/data/main.tex when cwd is ATS Engine).`
  );
}

function parseArgs(argv: string[]) {
  const opts: {
    resume?: string;
    jd?: string;
    out?: string;
    skipLlm?: boolean;
  } = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--resume" && next !== undefined) {
      opts.resume = next;
      i += 1;
      continue;
    }
    if (a === "--jd" && next !== undefined) {
      opts.jd = next;
      i += 1;
      continue;
    }
    if (a === "--out" && next !== undefined) {
      opts.out = next;
      i += 1;
      continue;
    }
    if (a === "--skip-llm") {
      opts.skipLlm = true;
      continue;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.resume) {
    console.error(
      "Usage: tsx src/cli/run.ts --resume <file.tex> [--jd <jd.txt>] [--out report-name.json] [--skip-llm]"
    );
    process.exit(1);
  }

  const cfg = loadConfigFromEnv();
  const resumePath = await resolveExistingFile(opts.resume, "Resume file");
  const jdPathResolved = opts.jd ? await resolveExistingFile(opts.jd, "JD file") : null;

  const latex = await fs.readFile(resumePath, "utf8");
  const resume = parseLatexResume(latex);
  const deterministic = scoreResumeDeterministic(resume);

  const report: Record<string, unknown> = {
    meta: {
      generatedAt: new Date().toISOString(),
      atsMode: cfg.mode,
      llmEnabled: !opts.skipLlm,
      resumePath,
      jdPath: jdPathResolved,
      runType: `${jdPathResolved ? "with-jd" : "no-jd"}_${opts.skipLlm ? "no-llm" : "llm"}`,
    },
    deterministic,
    resume: {
      bulletCount: resume.bullets.length,
      sectionCount: resume.sections.length,
    },
  };

  if (opts.skipLlm) {
    if (jdPathResolved) {
      const jdText = await fs.readFile(jdPathResolved, "utf8");
      report["fitDeterministic"] = scoreJdFitDeterministic(resume, jdText);
      try {
        report["fitSemantic"] = await scoreJdFitSemanticWithEmbeddings(resume, jdText);
      } catch (e) {
        report["fitSemanticError"] = e instanceof Error ? e.message : String(e);
      }
    }
    await writeOut(report, opts.out, Boolean(jdPathResolved), true);
    return;
  }

  const llm = createLLMClientFromConfig(cfg);

  const roles = await inferRolesAndCompetenciesWithLLM(resume, llm);
  report["rolesAndCompetencies"] = roles;

  if (jdPathResolved) {
    const jdText = await fs.readFile(jdPathResolved, "utf8");
    report["fitDeterministic"] = scoreJdFitDeterministic(resume, jdText);
    try {
      report["fitSemantic"] = await scoreJdFitSemanticWithEmbeddings(resume, jdText);
    } catch (e) {
      report["fitSemanticError"] = e instanceof Error ? e.message : String(e);
    }
    const jdRaw = JdRawInputSchema.parse({ text: jdText.trim() });
    const jd = await llm.normalizeJD(jdRaw);
    const fit = await explainStrictJdFitWithLLM(resume, jd, llm);
    report["jd"] = fit.jd;
    report["fit"] = fit.fit;
  }

  await writeOut(report, opts.out, Boolean(jdPathResolved), false);
}

function buildDefaultReportName(hasJd: boolean, skipLlm: boolean): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `report_${hasJd ? "jd" : "nojd"}_${skipLlm ? "nollm" : "llm"}_${ts}.json`;
}

async function writeOut(
  report: Record<string, unknown>,
  outPath: string | undefined,
  hasJd: boolean,
  skipLlm: boolean
) {
  const json = JSON.stringify(report, null, 2);
  const reportsDir = path.resolve("reports");
  const outFile = outPath ? path.basename(outPath) : buildDefaultReportName(hasJd, skipLlm);
  const p = path.join(reportsDir, outFile);
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(p, json, "utf8");
  console.log(`Wrote ${p}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
