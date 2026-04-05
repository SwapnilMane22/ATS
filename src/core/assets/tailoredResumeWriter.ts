import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCb, spawn } from "node:child_process";
import { promisify } from "node:util";
import { applyLatexPatch, type LatexPatchOp } from "../latex/patchLatex.js";
import type { ResumeDocument } from "../resume/types.js";

const execFile = promisify(execFileCb) as (
  file: string,
  args: readonly string[] | undefined,
  options: { encoding: BufferEncoding; env?: NodeJS.ProcessEnv; timeout?: number; maxBuffer?: number; windowsHide?: boolean }
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Process env with paths where Homebrew installs tectonic.
 */
function envWithTectonicPath(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const extra: string[] = [];
  if (process.platform === "darwin") {
    extra.push("/opt/homebrew/bin", "/usr/local/bin");
  }
  if (process.platform !== "win32") {
    extra.push("/usr/bin", "/bin");
  }
  const sep = path.delimiter;
  const existing = (env.PATH ?? "")
    .split(sep)
    .map((p) => p.trim())
    .filter(Boolean);
  const merged = [...extra.filter((e) => !existing.includes(e)), ...existing];
  env.PATH = merged.join(sep);
  return env;
}

let tectonicResolvedCache: string | undefined;

export function clearTectonicPathCache(): void {
  tectonicResolvedCache = undefined;
}

async function resolveTectonicUncached(): Promise<string> {
  const fromEnv = process.env.ATS_TECTONIC_PATH?.trim();
  if (fromEnv) return fromEnv;

  const absoluteCandidates: string[] = [];
  if (process.platform === "darwin") {
    absoluteCandidates.push("/opt/homebrew/bin/tectonic");
    absoluteCandidates.push("/usr/local/bin/tectonic");
  }

  for (const p of absoluteCandidates) {
    if (await pathExists(p)) return p;
  }

  const env = envWithTectonicPath();
  try {
    if (process.platform === "win32") {
      const { stdout } = (await execFile("where.exe", ["tectonic"], {
        env,
        encoding: "utf8",
        windowsHide: true,
      })) as { stdout: string | Buffer };
      const out = typeof stdout === "string" ? stdout : stdout.toString("utf8");
      const line = out
        .trim()
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .find(
          (l: string) => l.toLowerCase().endsWith("tectonic.exe") || l.toLowerCase().endsWith("tectonic")
        );
      if (line && (await pathExists(line))) return line;
    } else {
      const { stdout } = (await execFile("/bin/sh", ["-c", "command -v tectonic"], {
        env,
        encoding: "utf8",
      })) as { stdout: string | Buffer };
      const out = typeof stdout === "string" ? stdout : stdout.toString("utf8");
      const line = out.trim().split("\n")[0]?.trim();
      if (line && (await pathExists(line))) return line;
    }
  } catch {
    /* not on PATH */
  }

  return process.platform === "win32" ? "tectonic.exe" : "tectonic";
}

export async function resolveTectonic(): Promise<string> {
  if (tectonicResolvedCache !== undefined) return tectonicResolvedCache;
  tectonicResolvedCache = await resolveTectonicUncached();
  return tectonicResolvedCache;
}

function formatTectonicError(err: unknown, attemptedBin: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  const looksMissing =
    lower.includes("enoent") ||
    (lower.includes("command not found") && lower.includes("tectonic"));
  if (looksMissing) {
    return [
      `Tectonic is not available (tried: ${attemptedBin}).`,
      "Install it via `brew install tectonic` on macOS, or https://tectonic-typesetting.github.io/.",
      "If it is installed in a custom location, set ATS_TECTONIC_PATH in ATS Engine/.env to the full path.",
    ].join(" ");
  }
  return raw;
}

async function runTectonicSpawn(
  bin: string,
  args: string[],
  cwd: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: envWithTectonicPath(),
    });
    let err = "";
    child.stderr?.on("data", (c) => {
      err += String(c);
    });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-4000) || `tectonic exited ${code}`));
    });
  });
}

function sanitizeFilenamePart(s: string): string {
  return s
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

/**
 * `<FirstName> <LastName> Resume <Company> <Job Role>` (filesystem-safe).
 */
export function buildTailoredResumeBaseName(args: {
  firstName: string;
  lastName: string;
  company: string;
  jobRole: string;
}): string {
  const a = [
    sanitizeFilenamePart(args.firstName),
    sanitizeFilenamePart(args.lastName),
    "Resume",
    sanitizeFilenamePart(args.company),
    sanitizeFilenamePart(args.jobRole),
  ].filter((x) => x.length > 0);
  return a.join(" ");
}

export interface WriteTailoredResumeResult {
  assetsRoot: string;
  latexDir: string;
  pdfDir: string;
  baseName: string;
  texPath: string;
  pdfPath: string | null;
  pdfError: string | null;
  appliedOps: LatexPatchOp[];
  skippedOps: Array<{ op: LatexPatchOp; reason: string }>;
  /** The final LaTeX source string written to texPath */
  latex: string;
}

/**
 * Run tectonic with output PDFs under `outputDir`, working directory `cwd`
 * (use the résumé source folder so relative graphics paths resolve).
 */
export async function compileLatexToPdf(
  texAbsolutePath: string,
  outputDir: string,
  cwd: string
): Promise<{ ok: boolean; pdfPath?: string; error?: string }> {
  const absTex = path.resolve(texAbsolutePath);
  const bin = await resolveTectonic();
  await fs.mkdir(outputDir, { recursive: true });
  const base = path.basename(texAbsolutePath, ".tex");
  const outAbs = path.resolve(outputDir);

  try {
    await runTectonicSpawn(
      bin,
      [
        "-X",
        "compile",
        "--outdir",
        outAbs,
        absTex,
      ],
      cwd
    );
  } catch (e) {
    return { ok: false, error: formatTectonicError(e, bin) };
  }

  const pdfExpected = path.join(outAbs, `${base}.pdf`);
  try {
    await fs.access(pdfExpected);
    return { ok: true, pdfPath: pdfExpected };
  } catch {
    return { ok: false, error: "PDF not produced" };
  }
}

/** Stable name for side-by-side UI: `original.pdf` */
export const ORIGINAL_PDF_NAME = "original.pdf";

/**
 * Compile the source résumé (e.g. main.tex) to `assets/pdf/original.pdf`.
 */
export async function compileOriginalResumeToPdf(
  resumeAbsolutePath: string,
  pdfDir: string
): Promise<{ ok: boolean; pdfPath?: string; error?: string }> {
  const absTex = path.resolve(resumeAbsolutePath);
  const cwd = path.dirname(absTex);
  const base = path.basename(absTex, ".tex");
  await fs.mkdir(pdfDir, { recursive: true });
  const outAbs = path.resolve(pdfDir);

  const bin = await resolveTectonic();
  try {
    await runTectonicSpawn(
      bin,
      [
        "-X",
        "compile",
        "--outdir",
        outAbs,
        absTex,
      ],
      cwd
    );
  } catch (e) {
    return { ok: false, error: formatTectonicError(e, bin) };
  }

  const produced = path.join(outAbs, ORIGINAL_PDF_NAME);
  const fallback = path.join(outAbs, `${base}.pdf`);
  
  if (produced !== fallback) {
    try {
      await fs.access(fallback);
      await fs.rename(fallback, produced);
    } catch {
      // Ignored
    }
  }

  try {
    await fs.access(produced);
    return { ok: true, pdfPath: produced };
  } catch {
    return { ok: false, error: "PDF not produced for original résumé" };
  }
}

/**
 * Apply replace-only bullet patches; write TeX under `assets/latex/`, PDF under `assets/pdf/`.
 */
export async function writeTailoredResumeFiles(args: {
  resume: ResumeDocument;
  ops: LatexPatchOp[];
  firstName: string;
  lastName: string;
  company: string;
  jobRole: string;
  /** Path to the source .tex (for tectonic cwd / includes). */
  originalResumePath: string;
  assetsRoot?: string;
  tryPdf?: boolean;
}): Promise<WriteTailoredResumeResult> {
  const assetsRoot = path.resolve(args.assetsRoot ?? path.join(process.cwd(), "assets"));
  const latexDir = path.join(assetsRoot, "latex");
  const pdfDir = path.join(assetsRoot, "pdf");
  await fs.mkdir(latexDir, { recursive: true });
  await fs.mkdir(pdfDir, { recursive: true });

  const baseName = buildTailoredResumeBaseName(args);
  const replaceOnly = args.ops.filter((o) => o.kind === "replace_bullet");
  const { latex, appliedOps, skippedOps } = applyLatexPatch(args.resume, replaceOnly);

  const texPath = path.join(latexDir, `${baseName}.tex`);
  await fs.writeFile(texPath, latex, "utf8");

  let pdfPath: string | null = null;
  let pdfError: string | null = null;
  if (args.tryPdf !== false) {
    try {
      const cwd = path.dirname(path.resolve(args.originalResumePath));
      const r = await compileLatexToPdf(texPath, pdfDir, cwd);
      if (r.ok && r.pdfPath) {
        pdfPath = r.pdfPath;
      } else {
        pdfError = r.error ?? "Tectonic failed";
      }
    } catch (e) {
      pdfError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    assetsRoot,
    latexDir,
    pdfDir,
    baseName,
    texPath,
    pdfPath,
    pdfError,
    appliedOps,
    skippedOps,
    latex,
  };
}
