/**
 * Local API for the browser extension + web UI (Ollama / portfolio LLM via existing config).
 * Default port 3847 — set ATS_SERVER_PORT to override.
 */

import "../loadEnv.js";

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCandidateName } from "../candidateIdentity.js";
import { DEFAULT_LOCAL_OLLAMA_MODEL, loadConfigFromEnv } from "../config/mode.js";
import { runAtsAnalysis, resolveExistingFile } from "../pipeline/runAtsJob.js";

const PORT = Number(process.env.ATS_SERVER_PORT ?? "3847");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const UI_DIST = path.join(REPO_ROOT, "ui", "dist");

/** Shared with portfolio backend: `knowledge.json` lives here; LaTeX resume default is `main.tex` in this folder. */
const PORTFOLIO_BACKEND_DATA_DIR = process.env.PORTFOLIO_DATA_DIR
  ? path.resolve(process.env.PORTFOLIO_DATA_DIR)
  : path.resolve(REPO_ROOT, "..", "portfolio", "backend", "data");

const DEFAULT_RESUME_PATH = process.env.ATS_DEFAULT_RESUME
  ? path.resolve(process.env.ATS_DEFAULT_RESUME)
  : path.join(PORTFOLIO_BACKEND_DATA_DIR, "main.tex");

function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const ASSETS_PDF_DIR = path.join(REPO_ROOT, "assets", "pdf");
const ASSETS_LATEX_DIR = path.join(REPO_ROOT, "assets", "latex");

function safeLatexAssetPath(userPath: string): string | null {
  const resolved = path.resolve(userPath);
  if (!resolved.startsWith(ASSETS_LATEX_DIR + path.sep) && resolved !== ASSETS_LATEX_DIR) {
    return null;
  }
  return resolved;
}

/**
 * Older Vite builds used `./assets/...`, which breaks in some browsers when the location
 * bar omits a trailing slash. Force root-absolute `/assets/...` for scripts and styles.
 */
function normalizeSpaHtml(html: string): string {
  return html
    .replaceAll('src="./assets/', 'src="/assets/')
    .replaceAll("src='./assets/", "src='/assets/")
    .replaceAll('href="./assets/', 'href="/assets/')
    .replaceAll("href='./assets/", "href='/assets/");
}

function safePdfBasename(name: string): string | null {
  const base = path.basename(name.trim());
  if (base.includes("..") || /[/\\]/.test(base) || base.length > 220) return null;
  if (!base.toLowerCase().endsWith(".pdf")) return null;
  return base;
}

async function gatherRuntimeStatus(): Promise<{
  atsMode: string;
  localModel: string;
  ollamaBaseUrl: string;
  ollamaReachable: boolean;
  ollamaModels: string[];
  primaryModelPulled: boolean;
  portfolioFallbackEnabled: boolean;
}> {
  const cfg = loadConfigFromEnv();
  const localModel = cfg.localModel ?? DEFAULT_LOCAL_OLLAMA_MODEL;
  const ollamaBaseUrl = (process.env.ATS_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(
    /\/$/,
    ""
  );
  let ollamaReachable = false;
  let ollamaModels: string[] = [];
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4000);
    const r = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: ac.signal });
    clearTimeout(t);
    ollamaReachable = r.ok;
    if (r.ok) {
      const j = (await r.json()) as { models?: Array<{ name?: string }> };
      ollamaModels = (j.models ?? []).map((m) => m.name).filter(Boolean) as string[];
    }
  } catch {
    ollamaReachable = false;
  }
  const fb = (process.env.ATS_LOCAL_FALLBACK_PORTFOLIO ?? "1") !== "0";
  const hasKeys = Boolean(process.env.OPENROUTER_API_KEY) || Boolean(process.env.GEMINI_API_KEY);
  return {
    atsMode: cfg.mode,
    localModel,
    ollamaBaseUrl,
    ollamaReachable,
    ollamaModels,
    primaryModelPulled: ollamaModels.includes(localModel),
    portfolioFallbackEnabled: cfg.mode === "local" && fb && hasKeys,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true, service: "ats-engine", port: PORT });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    try {
      const runtime = await gatherRuntimeStatus();
      const knowledgeJsonPath = path.join(PORTFOLIO_BACKEND_DATA_DIR, "knowledge.json");
      const identity = await resolveCandidateName({
        resumePath: DEFAULT_RESUME_PATH,
        knowledgeJsonPath,
      });
      json(res, 200, {
        portfolioDataDir: PORTFOLIO_BACKEND_DATA_DIR,
        knowledgeJsonPath,
        defaultResumePath: DEFAULT_RESUME_PATH,
        defaultFirstName: identity.firstName,
        defaultLastName: identity.lastName,
        candidateNameSource: identity.source,
        candidateFullName: [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim(),
        ...runtime,
      });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    try {
      const runtime = await gatherRuntimeStatus();
      json(res, 200, {
        service: "ats-engine",
        port: PORT,
        ...runtime,
      });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        jdText?: string;
        resumePath?: string;
        company?: string;
        jobRole?: string;
        firstName?: string;
        lastName?: string;
        skipLlm?: boolean;
        noTailoredPdf?: boolean;
        noTailoring?: boolean;
      };
      const jdText = typeof body.jdText === "string" ? body.jdText : "";
      if (!jdText.trim()) {
        json(res, 400, { error: "jdText is required" });
        return;
      }
      const resumePath = await resolveExistingFile(
        body.resumePath?.trim() || DEFAULT_RESUME_PATH,
        "Resume file"
      );
      const knowledgeJsonPath = path.join(PORTFOLIO_BACKEND_DATA_DIR, "knowledge.json");
      const identity = await resolveCandidateName({ resumePath, knowledgeJsonPath });
      const firstName =
        (body.firstName?.trim() || "") ||
        process.env.ATS_USER_FIRST_NAME ||
        identity.firstName ||
        "Applicant";
      const lastName =
        (body.lastName?.trim() || "") || process.env.ATS_USER_LAST_NAME || identity.lastName || "";
      const company = body.company ?? process.env.ATS_JOB_COMPANY ?? "Company";
      const jobRole = body.jobRole ?? process.env.ATS_JOB_ROLE ?? "Role";
      const skipLlm = Boolean(body.skipLlm);
      const tailoring =
        skipLlm || body.noTailoring
          ? null
          : {
              firstName,
              lastName,
              company,
              jobRole,
              tryPdf: !body.noTailoredPdf,
            };

      const { report, tailoredAsset, originalPdfResult } = await runAtsAnalysis({
        resumePath,
        jdText,
        skipLlm,
        tailoring,
      });
      (report.meta as Record<string, unknown>)["jdPath"] = "(inline-from-extension)";

      const base = tailoredAsset?.baseName;
      const tailoredBasename =
        tailoredAsset?.pdfPath && path.isAbsolute(tailoredAsset.pdfPath)
          ? path.basename(tailoredAsset.pdfPath)
          : base
            ? `${base}.pdf`
            : null;
      const pdfServeUrl =
        tailoredBasename && tailoredAsset?.pdfPath
          ? `/api/resume-pdf?file=${encodeURIComponent(tailoredBasename)}`
          : null;
      const originalPdfUrl =
        originalPdfResult?.ok === true
          ? `/api/resume-pdf?file=${encodeURIComponent("original.pdf")}`
          : null;

      json(res, 200, {
        report,
        originalPdfUrl,
        originalPdfError: originalPdfResult?.ok ? null : (originalPdfResult?.error ?? null),
        tailored: tailoredAsset
          ? {
              texPath: tailoredAsset.texPath,
              pdfPath: tailoredAsset.pdfPath,
              pdfError: tailoredAsset.pdfError,
              baseName: tailoredAsset.baseName,
              pdfServeUrl,
            }
          : null,
      });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/save-tweaked") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { texPath?: string; latex?: string };
      if (!body.texPath || typeof body.latex !== "string") {
        json(res, 400, { error: "texPath and latex required" });
        return;
      }
      const target = safeLatexAssetPath(body.texPath);
      if (!target) {
        json(res, 403, { error: "Path must be under assets/latex" });
        return;
      }
      await fs.writeFile(target, body.latex, "utf8");
      json(res, 200, { ok: true, texPath: target });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/resume-pdf" || url.pathname === "/api/generated")) {
    const f = url.searchParams.get("file");
    const base = f ? safePdfBasename(f) : null;
    if (!base) {
      json(res, 400, { error: "Invalid PDF file name" });
      return;
    }
    const target = path.join(ASSETS_PDF_DIR, base);
    if (!target.startsWith(ASSETS_PDF_DIR + path.sep)) {
      json(res, 403, { error: "Forbidden" });
      return;
    }
    try {
      const buf = await fs.readFile(target);
      cors(res);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      });
      res.end(buf);
    } catch {
      json(res, 404, { error: "Not found" });
    }
    return;
  }

  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (url.pathname === "/" || url.pathname === "/index.html")
  ) {
    try {
      const raw = await fs.readFile(path.join(UI_DIST, "index.html"), "utf8");
      const html = normalizeSpaHtml(raw);
      cors(res);
      res.setHeader("Cache-Control", "no-store");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : html);
      return;
    } catch {
      json(res, 503, {
        error: "UI not built. Run: cd ui && npm install && npm run build",
      });
      return;
    }
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (url.pathname.startsWith("/assets/")) {
      const rel = url.pathname.slice("/assets/".length);
      const assetsRoot = path.join(UI_DIST, "assets");
      const resolvedRoot = path.resolve(assetsRoot);
      const filePath = path.resolve(path.join(assetsRoot, rel));
      const relSafe = path.relative(resolvedRoot, filePath);
      if (relSafe.startsWith("..") || path.isAbsolute(relSafe)) {
        json(res, 403, { error: "Forbidden" });
        return;
      }
      try {
        const buf = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const type =
          ext === ".js"
            ? "text/javascript"
            : ext === ".css"
              ? "text/css"
              : "application/octet-stream";
        cors(res);
        res.setHeader("Cache-Control", "no-store");
        res.writeHead(200, {
          "Content-Type": type,
          ...(req.method === "GET" ? { "Content-Length": String(buf.length) } : {}),
        });
        res.end(req.method === "HEAD" ? undefined : buf);
      } catch {
        json(res, 404, { error: "Not found" });
      }
      return;
    }
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ATS server http://127.0.0.1:${PORT}`);
});
