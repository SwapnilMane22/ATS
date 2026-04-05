/**
 * End-to-end ATS run: parse LaTeX resume, deterministic score, optional JD + LLM.
 *
 * Usage:
 *   npx tsx src/cli/run.ts --resume ./resume.tex [--jd ./jd.txt] [--out report.json] [--skip-llm]
 *   Optional tailoring: --first-name A --last-name B --company "Acme" --job-role "Engineer" [--no-tailored-pdf]
 */

import "../loadEnv.js";

import fs from "node:fs/promises";
import path from "node:path";
import { resolveCandidateName } from "../candidateIdentity.js";
import { createLLMClientFromConfig, loadConfigFromEnv } from "../config/mode.js";
import { parseLatexResume } from "../core/latex/parseLatex.js";
import { scoreResumeDeterministic } from "../core/scoring/rubric.js";
import { inferRolesAndCompetenciesWithLLM } from "../core/roles/classifyWithLLM.js";
import { loadScoringPolicy } from "../core/policy/scoringPolicy.js";
import { runAtsAnalysis, resolveExistingFile } from "../pipeline/runAtsJob.js";

function parseArgs(argv: string[]) {
  const opts: {
    resume?: string;
    jd?: string;
    out?: string;
    skipLlm?: boolean;
    firstName?: string;
    lastName?: string;
    company?: string;
    jobRole?: string;
    noTailoredPdf?: boolean;
    noTailoring?: boolean;
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
    if (a === "--first-name" && next !== undefined) {
      opts.firstName = next;
      i += 1;
      continue;
    }
    if (a === "--last-name" && next !== undefined) {
      opts.lastName = next;
      i += 1;
      continue;
    }
    if (a === "--company" && next !== undefined) {
      opts.company = next;
      i += 1;
      continue;
    }
    if (a === "--job-role" && next !== undefined) {
      opts.jobRole = next;
      i += 1;
      continue;
    }
    if (a === "--skip-llm") {
      opts.skipLlm = true;
      continue;
    }
    if (a === "--no-tailored-pdf") {
      opts.noTailoredPdf = true;
      continue;
    }
    if (a === "--no-tailoring") {
      opts.noTailoring = true;
      continue;
    }
  }
  return opts;
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

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.resume) {
    console.error(
      "Usage: tsx src/cli/run.ts --resume <file.tex> [--jd <jd.txt>] [--out name.json] [--skip-llm] " +
        "[--first-name ... --last-name ... --company ... --job-role ...] [--no-tailored-pdf] [--no-tailoring]"
    );
    process.exit(1);
  }

  const cfg = loadConfigFromEnv();
  const policyMeta = await loadScoringPolicy();
  const resumePath = await resolveExistingFile(opts.resume, "Resume file");
  const jdPathResolved = opts.jd ? await resolveExistingFile(opts.jd, "JD file") : null;

  if (!jdPathResolved) {
    const latex = await fs.readFile(resumePath, "utf8");
    const resume = parseLatexResume(latex);
    const deterministic = scoreResumeDeterministic(resume);
    const llm = opts.skipLlm ? null : createLLMClientFromConfig(cfg);
    const report: Record<string, unknown> = {
      meta: {
        generatedAt: new Date().toISOString(),
        atsMode: cfg.mode,
        llmEnabled: Boolean(llm),
        resumePath,
        jdPath: null,
        runType: "no-jd",
        scoringPolicyVersion: policyMeta.policy.version,
        scoringPolicySha256: policyMeta.policySha256,
        scoringPolicyPath: policyMeta.policyPath,
      },
      deterministic,
      resume: {
        bulletCount: resume.bullets.length,
        sectionCount: resume.sections.length,
      },
    };
    if (llm) {
      report["rolesAndCompetencies"] = await inferRolesAndCompetenciesWithLLM(resume, llm);
    }
    await writeOut(report, opts.out, false, Boolean(opts.skipLlm));
    return;
  }

  const jdText = await fs.readFile(jdPathResolved, "utf8");
  const knowledgeJsonPath = process.env.PORTFOLIO_DATA_DIR
    ? path.join(path.resolve(process.env.PORTFOLIO_DATA_DIR), "knowledge.json")
    : path.join(path.dirname(resumePath), "knowledge.json");
  const identity = await resolveCandidateName({ resumePath, knowledgeJsonPath });
  const firstName =
    opts.firstName?.trim() ||
    process.env.ATS_USER_FIRST_NAME ||
    identity.firstName ||
    "Applicant";
  const lastName =
    opts.lastName?.trim() || process.env.ATS_USER_LAST_NAME || identity.lastName || "";
  const company = opts.company ?? process.env.ATS_JOB_COMPANY ?? "Company";
  const jobRole = opts.jobRole ?? process.env.ATS_JOB_ROLE ?? "Role";

  const tailoring =
    opts.noTailoring || opts.skipLlm
      ? null
      : {
          firstName,
          lastName,
          company,
          jobRole,
          tryPdf: !opts.noTailoredPdf,
        };

  const { report } = await runAtsAnalysis({
    resumePath,
    jdText,
    skipLlm: Boolean(opts.skipLlm),
    tailoring,
  });
  report["meta"] = {
    ...(report["meta"] as object),
    jdPath: jdPathResolved,
  };

  await writeOut(report, opts.out, true, Boolean(opts.skipLlm));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
