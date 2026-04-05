import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLLMClientFromConfig, loadConfigFromEnv } from "../config/mode.js";
import { parseLatexResume } from "../core/latex/parseLatex.js";
import { extractJdRequirementPhrases, scoreJdFitDeterministic } from "../core/jd/fitDeterministic.js";
import { scoreJdFitSemanticWithEmbeddings } from "../core/jd/semanticFit.js";
import { scoreResumeDeterministic } from "../core/scoring/rubric.js";
import { inferRolesAndCompetenciesWithLLM } from "../core/roles/classifyWithLLM.js";
import { explainStrictJdFitWithLLM } from "../core/jd/fitWithLLM.js";
import { JdRawInputSchema } from "../llm/schemas/index.js";
import { deriveDecisionBand, loadScoringPolicy } from "../core/policy/scoringPolicy.js";
import type { LLMClient } from "../llm/LLMClient.js";
import type { FitExplanationResult, JdNormalized } from "../llm/schemas/index.js";
import { buildDecisionTrace, calibrationFromTrace } from "../core/jd/decisionTrace.js";
import {
  tailoredSuggestionsForBand,
  selectBulletsForRewrite,
} from "../core/tailor/bandTailoring.js";
import { filterSafeBulletVariants } from "../core/tailor/safeRewrite.js";
import {
  compileOriginalResumeToPdf,
  writeTailoredResumeFiles,
} from "../core/assets/tailoredResumeWriter.js";
import type { LatexPatchOp } from "../core/latex/patchLatex.js";

const __dirnamePipeline = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirnamePipeline, "..", "..");
const ASSETS_ROOT = path.join(REPO_ROOT, "assets");

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(varr);
}

function avgCoverage(items: Array<{ covered: boolean }>): number {
  if (items.length === 0) return 0;
  return items.reduce((a, b) => a + (b.covered ? 1 : 0), 0) / items.length;
}

async function runLlmFitPasses(
  passes: number,
  resume: ReturnType<typeof parseLatexResume>,
  jd: JdNormalized,
  llm: LLMClient
): Promise<{ fits: FitExplanationResult[]; meanFit: FitExplanationResult }> {
  const fits: FitExplanationResult[] = [];
  for (let i = 0; i < passes; i += 1) {
    const fit = (await explainStrictJdFitWithLLM(resume, jd, llm)).fit;
    fits.push(fit);
  }
  const meanScore = fits.reduce((a, b) => a + b.fitScore, 0) / fits.length;
  const meanMust = fits.reduce((a, b) => a + b.mustHaveCoverage, 0) / fits.length;
  const meanNice = fits.reduce((a, b) => a + b.niceToHaveCoverage, 0) / fits.length;
  const coverage = fits[0]?.coverage ?? [];
  const gaps = fits[0]?.gaps ?? [];
  const tailoredSuggestions = fits[0]?.tailoredSuggestions ?? [];
  const tier = meanScore >= 75 ? "strong_fit" : meanScore >= 55 ? "borderline" : "not_a_fit";
  return {
    fits,
    meanFit: {
      fitScore: Math.round(meanScore),
      tier,
      mustHaveCoverage: Number(meanMust.toFixed(4)),
      niceToHaveCoverage: Number(meanNice.toFixed(4)),
      coverage,
      gaps,
      tailoredSuggestions,
    },
  };
}

export interface TailoringMeta {
  firstName: string;
  lastName: string;
  company: string;
  jobRole: string;
  tryPdf: boolean;
}

export interface RunAtsAnalysisOptions {
  resumePath: string;
  jdText: string;
  skipLlm: boolean;
  llm?: LLMClient;
  tailoring: TailoringMeta | null;
}

export interface RunAtsAnalysisResult {
  report: Record<string, unknown>;
  tailoredAsset: Awaited<ReturnType<typeof writeTailoredResumeFiles>> | null;
  originalPdfResult: { ok: boolean; pdfPath?: string; error?: string } | null;
}

export async function runAtsAnalysis(opts: RunAtsAnalysisOptions): Promise<RunAtsAnalysisResult> {
  const cfg = loadConfigFromEnv();
  const policyMeta = await loadScoringPolicy();
  const latex = await fs.readFile(opts.resumePath, "utf8");
  const resume = parseLatexResume(latex);
  const deterministic = scoreResumeDeterministic(resume);

  const report: Record<string, unknown> = {
    meta: {
      generatedAt: new Date().toISOString(),
      atsMode: cfg.mode,
      llmEnabled: !opts.skipLlm,
      resumePath: opts.resumePath,
      jdPath: null,
      runType: `with-jd_${opts.skipLlm ? "no-llm" : "llm"}`,
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

  const jdText = opts.jdText;
  const fitDeterministic = scoreJdFitDeterministic(resume, jdText);
  report["fitDeterministic"] = fitDeterministic;
  const requirementPhrases = extractJdRequirementPhrases(jdText).slice(0, 80);
  let fitSemantic: Awaited<ReturnType<typeof scoreJdFitSemanticWithEmbeddings>> | undefined;
  try {
    fitSemantic = await scoreJdFitSemanticWithEmbeddings(resume, jdText);
    report["fitSemantic"] = fitSemantic;
  } catch (e) {
    report["fitSemanticError"] = e instanceof Error ? e.message : String(e);
  }

  let tailoredAsset: Awaited<ReturnType<typeof writeTailoredResumeFiles>> | null = null;

  if (opts.skipLlm) {
    const semanticScore = fitSemantic?.fitScore ?? fitDeterministic.fitScore;
    const finalScore =
      fitDeterministic.fitScore * policyMeta.policy.weights.deterministic +
      semanticScore * policyMeta.policy.weights.semantic;
    const confidence = clamp01(
      0.5 +
        (Math.min(fitDeterministic.fitScore, semanticScore) / 100) * 0.25 +
        (1 - Math.abs(fitDeterministic.fitScore - semanticScore) / 100) * 0.25
    );
    const uncertainty = Number((1 - confidence).toFixed(4));
    const decisionBand = deriveDecisionBand(
      policyMeta.policy,
      finalScore,
      confidence,
      fitDeterministic.mustHaveCoverage
    );
    report["opportunityAssessment"] = {
      finalScore: Number(finalScore.toFixed(2)),
      confidence: Number(confidence.toFixed(4)),
      uncertainty,
      decisionBand,
    };
    const decisionTrace = buildDecisionTrace({
      requirementPhrases,
      deterministicCovered: new Set(fitDeterministic.coveredKeywords),
      semanticCoverage: fitSemantic
        ? fitSemantic.coverage.map((c) => ({
            requirement: c.requirement,
            similarity: c.similarity,
            bestBulletId: c.bestBulletId,
          }))
        : [],
    });
    report["decisionTrace"] = decisionTrace;
    report["calibrationDiagnostics"] = calibrationFromTrace(decisionTrace);
    report["bandTailoring"] = {
      band: decisionBand,
      tone:
        decisionBand === "apply_strong"
          ? "light_polish_and_keyword_alignment"
          : decisionBand === "apply_borderline"
            ? "emphasize_evidence_for_gaps"
            : "honest_gap_mapping_minimal_rewrite",
      narrativeSuggestions: [],
      maxBulletsToRewrite: 0,
      note: "LLM disabled: no narrative tailor list or LaTeX rewrites. Re-run with LLM for those outputs.",
    };
    let originalPdfResult: RunAtsAnalysisResult["originalPdfResult"] = null;
    try {
      originalPdfResult = await compileOriginalResumeToPdf(
        opts.resumePath,
        path.join(ASSETS_ROOT, "pdf")
      );
    } catch (e) {
      originalPdfResult = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    return { report, tailoredAsset, originalPdfResult };
  }

  const llm = opts.llm ?? createLLMClientFromConfig(cfg);
  const roles = await inferRolesAndCompetenciesWithLLM(resume, llm);
  report["rolesAndCompetencies"] = roles;

  const jdRaw = JdRawInputSchema.parse({ text: jdText.trim() });
  const jd = await llm.normalizeJD(jdRaw);
  const passCount = Math.max(1, Number(process.env.ATS_LLM_FIT_PASSES ?? "3"));
  const { fits, meanFit } = await runLlmFitPasses(passCount, resume, jd, llm);
  const llmScores = fits.map((f) => f.fitScore);
  const llmScoreMean = llmScores.reduce((a, b) => a + b, 0) / llmScores.length;
  const llmScoreStd = stdDev(llmScores);
  const llmCoverageAgree =
    passCount > 1 ? 1 - stdDev(fits.map((f) => avgCoverage(f.coverage))) : 1;
  report["jd"] = jd;
  report["fit"] = meanFit;
  report["fitPasses"] = {
    passCount,
    scoreSamples: llmScores,
    scoreMean: Number(llmScoreMean.toFixed(4)),
    scoreStdDev: Number(llmScoreStd.toFixed(4)),
    coverageAgreement: Number(clamp01(llmCoverageAgree).toFixed(4)),
  };

  const semanticScore = fitSemantic?.fitScore ?? fitDeterministic.fitScore;
  const finalScore =
    fitDeterministic.fitScore * policyMeta.policy.weights.deterministic +
    semanticScore * policyMeta.policy.weights.semantic +
    meanFit.fitScore * policyMeta.policy.weights.llmFit;
  const confidence = clamp01(
    0.4 +
      (1 - Math.min(1, llmScoreStd / 25)) * 0.2 +
      (1 - Math.abs(fitDeterministic.fitScore - semanticScore) / 100) * 0.2 +
      (meanFit.mustHaveCoverage >= policyMeta.policy.thresholds.mustHaveCoverageMin ? 0.2 : 0)
  );
  const uncertainty = Number((1 - confidence).toFixed(4));
  const decisionBand = deriveDecisionBand(
    policyMeta.policy,
    finalScore,
    confidence,
    meanFit.mustHaveCoverage
  );
  report["opportunityAssessment"] = {
    finalScore: Number(finalScore.toFixed(2)),
    confidence: Number(confidence.toFixed(4)),
    uncertainty,
    decisionBand,
    thresholdsUsed: policyMeta.policy.thresholds,
  };
  const decisionTrace = buildDecisionTrace({
    requirementPhrases,
    deterministicCovered: new Set(fitDeterministic.coveredKeywords),
    semanticCoverage: (fitSemantic?.coverage ?? []).map((c) => ({
      requirement: c.requirement,
      similarity: c.similarity,
      bestBulletId: c.bestBulletId,
    })),
    jd,
    fit: meanFit,
  });
  report["decisionTrace"] = decisionTrace;
  report["calibrationDiagnostics"] = calibrationFromTrace(decisionTrace);

  const bandPlan = tailoredSuggestionsForBand(decisionBand, meanFit);
  report["bandTailoring"] = {
    band: bandPlan.band,
    tone: bandPlan.tone,
    maxBulletsToRewrite: bandPlan.maxBulletsToRewrite,
    narrativeSuggestions: bandPlan.narrativeSuggestions,
  };
  report["complianceAudit"] = {
    excludedLogisticsAndBenefits: true,
    excludedProtectedAttributeContent: true,
    notes: [
      "Location/compensation/benefits/EEO-like lines are excluded from deterministic and semantic JD scoring.",
      "Tailored LaTeX uses replace_bullet only; no new experience sections or fabricated skills.",
    ],
  };

  if (opts.tailoring) {
    const allBulletIds = resume.bullets.map((b) => b.bulletId);
    const suggestedIds = (meanFit.tailoredSuggestions ?? [])
      .flatMap((s) => s.evidence)
      .map((e) => e.bulletId);
    
    const bulletIds = selectBulletsForRewrite(
      decisionTrace,
      bandPlan.maxBulletsToRewrite,
      allBulletIds,
      suggestedIds
    );
    const byId = new Map(resume.bullets.map((b) => [b.bulletId, b]));
    const bulletsForLlm = bulletIds
      .map((id) => byId.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({
        bulletId: b.bulletId,
        // Send the real LaTeX-escaped content to LLM so it works natively in LaTeX format.
        // rawLatex contains \$, \%, etc. exactly as they appear in the source .tex file.
        text: b.rawLatex ?? b.text,
        sectionPath: b.sectionPath,
      }));

    if (bulletsForLlm.length > 0) {
      const rewriteResult = await llm.suggestBulletRewrites({
        bullets: bulletsForLlm.map((b) => ({ ...b, evidence: [] })),
        constraints: {
          style: "concise_impact_first",
          maxChars: 280,
          forbidFabrication: true,
          preserveTech: true,
          allowMetricPlaceholders: true,
        },
        jobContext: { targetRoleTitle: opts.tailoring.jobRole },
        // Pass JD key phrases so the model can align language
        // @ts-ignore — extra field passed through to prompt builder
        jdContext: jdText.slice(0, 3000),
      });
      const { accepted, rejected } = filterSafeBulletVariants(resume, rewriteResult.variants, jdText);
      const firstByBullet = new Map<string, { bulletId: string; newText: string; originalText: string }>();
      for (const v of accepted) {
        if (!firstByBullet.has(v.bulletId)) {
          const originalText = byId.get(v.bulletId)?.text ?? "";
          firstByBullet.set(v.bulletId, {
            bulletId: v.bulletId,
            newText: v.text,
            originalText,
          });
        }
      }
      // Only include ops where text actually changed
      const ops: LatexPatchOp[] = [...firstByBullet.values()]
        .filter((v) => v.newText.trim() !== v.originalText.trim())
        .map((v) => ({
          kind: "replace_bullet" as const,
          bulletId: v.bulletId,
          // Use rawLatex as originalText for patching — exact LaTeX string to find in the file
          originalText: byId.get(v.bulletId)?.rawLatex ?? v.originalText,
          newText: v.newText,
        }));

      tailoredAsset = await writeTailoredResumeFiles({
        resume,
        ops,
        firstName: opts.tailoring.firstName,
        lastName: opts.tailoring.lastName,
        company: opts.tailoring.company,
        jobRole: opts.tailoring.jobRole,
        originalResumePath: opts.resumePath,
        assetsRoot: ASSETS_ROOT,
        tryPdf: opts.tailoring.tryPdf,
      });
      const bulletById = new Map(resume.bullets.map((b) => [b.bulletId, b]));
      // Strip LaTeX escape sequences so the diff panel shows clean readable text
      function latexToReadable(s: string): string {
        return s
          .replace(/\\(?:textbf|textit|emph|underline)\{([^}]*)\}/g, "$1")
          .replace(/\\(?:href)\{[^}]*\}\{([^}]*)\}/g, "$1")
          .replace(/\\\$/g, "$")
          .replace(/\\%/g, "%")
          .replace(/\\&/g, "&")
          .replace(/\\#/g, "#")
          .replace(/\\\\/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      const changeSummary = tailoredAsset.appliedOps
        .filter((o): o is Extract<LatexPatchOp, { kind: "replace_bullet" }> => o.kind === "replace_bullet")
        .map((o) => {
          const bullet = bulletById.get(o.bulletId);
          const sectionPath = bullet?.sectionPath ?? [];
          const sectionLabel = sectionPath.join(" › ");
          return {
            bulletId: o.bulletId,
            // Display clean readable text in the diff panel (strip LaTeX escapes)
            before: latexToReadable(bullet?.rawLatex ?? bullet?.text ?? ""),
            after: latexToReadable(o.newText),
            sectionLabel,
          };
        });
      report["tailoredResume"] = {
        texPath: tailoredAsset.texPath,
        pdfPath: tailoredAsset.pdfPath,
        pdfError: tailoredAsset.pdfError,
        appliedOps: tailoredAsset.appliedOps,
        skippedOps: tailoredAsset.skippedOps,
        latexDir: tailoredAsset.latexDir,
        pdfDir: tailoredAsset.pdfDir,
        changeSummary,
        rewriteRejected: rejected.map((r) => ({
          bulletId: r.variant.bulletId,
          reason: r.reason,
        })),
      };

      // PASS 2: Score the Tailored Resume
      // Use the actually-patched LaTeX text so scoring matches what's written to disk
      const tailoredLatex = tailoredAsset?.latex ?? resume.rawText;
      const tailoredResume = parseLatexResume(tailoredLatex);

      const tailoredDeterministic = scoreJdFitDeterministic(tailoredResume, jdText);
      const tailoredSemantic = await scoreJdFitSemanticWithEmbeddings(tailoredResume, jdText).catch(() => undefined);
      // Use min(2, passCount) passes to reduce variance vs single pass
      const tailoredPassCount = Math.min(2, passCount);
      const tailoredFit = await runLlmFitPasses(tailoredPassCount, tailoredResume, jd, llm);
      
      const tSemanticScore = tailoredSemantic?.fitScore ?? tailoredDeterministic.fitScore;
      const tFinalScore =
        tailoredDeterministic.fitScore * policyMeta.policy.weights.deterministic +
        tSemanticScore * policyMeta.policy.weights.semantic +
        tailoredFit.meanFit.fitScore * policyMeta.policy.weights.llmFit;
        
      const tConfidence = clamp01(
        0.6 + // std = 0 factor for 1 pass 
          (1 - Math.abs(tailoredDeterministic.fitScore - tSemanticScore) / 100) * 0.2 +
          (tailoredFit.meanFit.mustHaveCoverage >= policyMeta.policy.thresholds.mustHaveCoverageMin ? 0.2 : 0)
      );
      
      const tDecisionBand = deriveDecisionBand(
        policyMeta.policy,
        tFinalScore,
        tConfidence,
        tailoredFit.meanFit.mustHaveCoverage
      );

      // Preserve baseline for ROI comparison
      report["baselineAssessment"] = report["opportunityAssessment"];
      report["baselineFit"] = report["fit"];
      report["baselineFitDeterministic"] = report["fitDeterministic"];
      
      // Upgrade primary metrics to reflect Tailored Resume
      report["opportunityAssessment"] = {
        finalScore: Number(tFinalScore.toFixed(2)),
        confidence: Number(tConfidence.toFixed(4)),
        uncertainty: Number((1 - tConfidence).toFixed(4)),
        decisionBand: tDecisionBand,
        thresholdsUsed: policyMeta.policy.thresholds,
      };
      report["fit"] = tailoredFit.meanFit;
      report["fitDeterministic"] = tailoredDeterministic;
    }
  }

  let originalPdfResult: RunAtsAnalysisResult["originalPdfResult"] = null;
  try {
    originalPdfResult = await compileOriginalResumeToPdf(
      opts.resumePath,
      path.join(ASSETS_ROOT, "pdf")
    );
  } catch (e) {
    originalPdfResult = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { report, tailoredAsset, originalPdfResult };
}

/**
 * Resolve resume path like CLI (cwd and parent dirs).
 */
export async function resolveExistingFile(
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
      /* next */
    }
  }
  throw new Error(
    `${label} not found. Tried:\n${[...seen].map((x) => `  - ${x}`).join("\n")}\n` +
      `Hint: use an absolute path, or a path relative to this folder.`
  );
}
