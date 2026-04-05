import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { diffWords } from "diff";

// ── Professional Resume Change Viewer ──────────────────────────────────────────
interface ChangeRow {
  bulletId: string;
  before: string;
  after: string;
  sectionLabel?: string;
}

function BulletDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  const hasChanges = parts.some((p) => p.added || p.removed);
  if (!hasChanges) return null;
  return (
    <div className="resume-diff-bullet">
      {/* BEFORE row */}
      <div className="resume-diff-row resume-diff-row--before">
        <span className="resume-diff-label">Before</span>
        <span className="resume-diff-text">
          {parts.map((p, i) =>
            p.removed ? (
              <mark key={i} className="diff-mark diff-mark--removed">{p.value}</mark>
            ) : !p.added ? (
              <span key={i}>{p.value}</span>
            ) : null
          )}
        </span>
      </div>
      {/* AFTER row */}
      <div className="resume-diff-row resume-diff-row--after">
        <span className="resume-diff-label">After</span>
        <span className="resume-diff-text">
          {parts.map((p, i) =>
            p.added ? (
              <mark key={i} className="diff-mark diff-mark--added">{p.value}</mark>
            ) : !p.removed ? (
              <span key={i}>{p.value}</span>
            ) : null
          )}
        </span>
      </div>
    </div>
  );
}

function ResumeDiffPanel({ changes }: { changes: ChangeRow[] }) {
  const visibleChanges = changes.filter((c) => {
    const parts = diffWords(c.before, c.after);
    return parts.some((p) => p.added || p.removed);
  });

  if (visibleChanges.length === 0) return null;

  return (
    <div className="resume-diff-panel">
      <div className="resume-diff-header">
        <div className="resume-diff-title">
          <span className="resume-diff-icon">✦</span>
          Resume Changes
        </div>
        <span className="resume-diff-count">{visibleChanges.length} bullet{visibleChanges.length !== 1 ? "s" : ""} refined</span>
      </div>
      <div className="resume-diff-legend">
        <span className="legend-item"><mark className="diff-mark diff-mark--removed legend-swatch">removed</mark> original wording</span>
        <span className="legend-item"><mark className="diff-mark diff-mark--added legend-swatch">added</mark> improved wording</span>
      </div>
      <ol className="resume-diff-list">
        {visibleChanges.map((row, idx) => (
          <li key={row.bulletId} className="resume-diff-item">
            <div className="resume-diff-meta">
              <span className="resume-diff-num">Change {idx + 1}</span>
              {row.sectionLabel && (
                <span className="resume-diff-section">{row.sectionLabel}</span>
              )}
            </div>
            <BulletDiff before={row.before} after={row.after} />
          </li>
        ))}
      </ol>
    </div>
  );
}
function apiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://127.0.0.1:3847";
}

/** Live duration for the analysis run (sub‑minute shows tenths; longer uses m:ss.d). */
function formatAnalysisElapsed(ms: number): string {
  const t = Math.max(0, ms) / 1000;
  if (t < 60) return `${t.toFixed(1)}s`;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const whole = Math.floor(s);
  const frac = Math.min(9, Math.round((s - whole) * 10));
  return `${m}:${String(whole).padStart(2, "0")}.${frac}`;
}

function initialsFromName(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
          <h1 style={{ fontSize: "1.1rem" }}>UI failed to render</h1>
          <pre
            style={{
              background: "#fee",
              padding: 12,
              borderRadius: 8,
              overflow: "auto",
              fontSize: 12,
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

type Theme = "light" | "dark";

function AppInner() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [resumePath, setResumePath] = useState("");
  const [pathsHint, setPathsHint] = useState<{
    portfolioDataDir: string;
    knowledgeJsonPath: string;
    defaultResumePath: string;
  } | null>(null);
  const [engineStatus, setEngineStatus] = useState<{
    atsMode: string;
    localModel: string;
    ollamaBaseUrl: string;
    ollamaReachable: boolean;
    ollamaModels: string[];
    primaryModelPulled: boolean;
    portfolioFallbackEnabled: boolean;
  } | null>(null);
  const [candidateName, setCandidateName] = useState<{
    fullName: string;
    source: string;
  } | null>(null);
  const [skipLlm, setSkipLlm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);
  const [originalPdfError, setOriginalPdfError] = useState<string | null>(null);
  const [tailored, setTailored] = useState<{
    texPath?: string;
    pdfServeUrl?: string | null;
    pdfError?: string | null;
  } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const jd = q.get("jd");
    if (jd) setJdText(jd);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase()}/api/config`)
      .then((r) => r.json())
      .then(
        (c: {
          portfolioDataDir?: string;
          knowledgeJsonPath?: string;
          defaultResumePath?: string;
          atsMode?: string;
          localModel?: string;
          ollamaBaseUrl?: string;
          ollamaReachable?: boolean;
          ollamaModels?: string[];
          primaryModelPulled?: boolean;
          portfolioFallbackEnabled?: boolean;
          candidateFullName?: string;
          candidateNameSource?: string;
        }) => {
          if (cancelled || !c.defaultResumePath) return;
          setPathsHint({
            portfolioDataDir: c.portfolioDataDir ?? "",
            knowledgeJsonPath: c.knowledgeJsonPath ?? "",
            defaultResumePath: c.defaultResumePath,
          });
          if (typeof c.candidateFullName === "string" && c.candidateNameSource) {
            setCandidateName({ fullName: c.candidateFullName, source: c.candidateNameSource });
          }
          if (
            c.atsMode &&
            c.localModel &&
            c.ollamaBaseUrl !== undefined &&
            c.ollamaReachable !== undefined &&
            Array.isArray(c.ollamaModels) &&
            c.primaryModelPulled !== undefined &&
            c.portfolioFallbackEnabled !== undefined
          ) {
            setEngineStatus({
              atsMode: c.atsMode,
              localModel: c.localModel,
              ollamaBaseUrl: c.ollamaBaseUrl,
              ollamaReachable: c.ollamaReachable,
              ollamaModels: c.ollamaModels,
              primaryModelPulled: c.primaryModelPulled,
              portfolioFallbackEnabled: c.portfolioFallbackEnabled,
            });
          }
          setResumePath((prev) => (prev.trim() === "" ? c.defaultResumePath! : prev));
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const start = performance.now();
    setAnalysisElapsedMs(0);
    const id = window.setInterval(() => {
      setAnalysisElapsedMs(Math.round(performance.now() - start));
    }, 100);
    return () => clearInterval(id);
  }, [loading]);

  const band = useMemo(() => {
    const oa = report?.opportunityAssessment as Record<string, unknown> | undefined;
    return (oa?.decisionBand as string) ?? "—";
  }, [report]);

  const cal = report?.calibrationDiagnostics as Record<string, unknown> | undefined;

  const runAnalyze = useCallback(async () => {
    setErr(null);
    setOriginalPdfUrl(null);
    setOriginalPdfError(null);
    if (!jdText.trim()) {
      setErr("Add a job description to run the analysis.");
      return;
    }
    setLoading(true);
    setReport(null);
    setTailored(null);
    try {
      const res = await fetch(`${apiBase()}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText,
          company: company || undefined,
          jobRole: jobRole || undefined,
          resumePath: resumePath.trim() || undefined,
          skipLlm,
          noTailoredPdf: false,
        }),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        setErr(`Server returned non-JSON (${res.status}). Is the API running at ${apiBase()}?`);
        return;
      }
      if (!res.ok) {
        setErr((data.error as string) || res.statusText);
        return;
      }
      setReport((data.report as Record<string, unknown>) ?? null);
      const opu = data.originalPdfUrl;
      setOriginalPdfUrl(typeof opu === "string" && opu.length > 0 ? opu : null);
      const ope = data.originalPdfError;
      setOriginalPdfError(typeof ope === "string" && ope.length > 0 ? ope : null);
      const t = data.tailored as Record<string, unknown> | null;
      setTailored(
        t
          ? {
              texPath: t.texPath as string,
              pdfServeUrl: (t.pdfServeUrl as string) ?? null,
              pdfError: (t.pdfError as string) ?? null,
            }
          : null
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jdText, company, jobRole, resumePath, skipLlm]);

  const changeSummary = useMemo(() => {
    const tr = report?.tailoredResume as
      | { changeSummary?: Array<{ bulletId: string; before: string; after: string; sectionLabel?: string }> }
      | undefined;
    const rows = tr?.changeSummary;
    return Array.isArray(rows) && rows.length > 0 ? rows : null;
  }, [report]);

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand">
          <div className="brand-mark" aria-hidden />
          <div>
            <h1 className="brand-title">ATS Engine</h1>
            <p className="brand-tagline">
              Match your résumé to a role with calibrated scoring, JD fit, and side-by-side PDF previews.
              Use the same host as the API (e.g. <code>127.0.0.1</code>).
            </p>
          </div>
        </div>
        <div className="top-nav-right">
          {engineStatus && (
            <div className="pill-row" aria-label="Runtime status">
              <span
                className={`pill ${engineStatus.ollamaReachable ? "pill--ok" : "pill--warn"}`}
                title={engineStatus.ollamaBaseUrl}
              >
                <span className="pill-dot" />
                Ollama {engineStatus.ollamaReachable ? "connected" : "unreachable"}
              </span>
              <span className="pill" title="ATS_LOCAL_MODEL">
                Model · {engineStatus.localModel}
              </span>
              {!engineStatus.primaryModelPulled && (
                <span className="pill pill--warn">Model not pulled — run ollama pull</span>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark" : "Light"} mode
          </button>
        </div>
      </header>

      {engineStatus && (
        <details className="system-panel">
          <summary>System health &amp; model details</summary>
          <div className="system-panel-body">
            <p style={{ margin: 0 }}>
              <strong>Mode</strong> {engineStatus.atsMode} · <strong>Ollama</strong>{" "}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{engineStatus.ollamaBaseUrl}</span>
            </p>
            <p style={{ margin: "12px 0 0" }}>
              <strong>Cloud fallback</strong> — {engineStatus.portfolioFallbackEnabled ? "Enabled" : "Disabled"}
              {engineStatus.portfolioFallbackEnabled
                ? " (used if Ollama fails)."
                : ". Configure API keys and ATS_LOCAL_FALLBACK_PORTFOLIO=1 to enable."}
            </p>
            <p style={{ margin: "12px 0 0", fontSize: "0.8rem", color: "var(--muted-faint)" }}>
              Adjust <code>ATS_LOCAL_MODEL</code> in <code>.env</code> after <code>ollama pull</code> for heavier models.
            </p>
          </div>
        </details>
      )}

      <section className="panel">
        <p className="panel-title">Application</p>
        <h2 className="panel-headline">Run analysis</h2>

        {candidateName && (
          <div className="profile-strip">
            <div className="profile-avatar" aria-hidden>
              {initialsFromName(candidateName.fullName)}
            </div>
            <div className="profile-text">
              <h2>{candidateName.fullName || "Candidate"}</h2>
              <p className="profile-meta">
                Profile name from {candidateName.source === "knowledge.json" ? "portfolio data" : "résumé"} (
                {candidateName.source})
              </p>
            </div>
          </div>
        )}

        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="company">
              Company
            </label>
            <input
              id="company"
              className="input-field"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Goldman Sachs"
              autoComplete="organization"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="jobrole">
              Role title
            </label>
            <input
              id="jobrole"
              className="input-field"
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              placeholder="e.g. Software Engineer"
              autoComplete="off"
            />
          </div>
        </div>

        <details className="details-enterprise" style={{ marginTop: 20 }}>
          <summary>Résumé &amp; data paths</summary>
          <div className="details-body">
            <label className="field-label" htmlFor="resumepath">
              LaTeX résumé file
            </label>
            <input
              id="resumepath"
              className="input-field"
              value={resumePath}
              onChange={(e) => setResumePath(e.target.value)}
              placeholder={pathsHint ? pathsHint.defaultResumePath : "Path to main.tex"}
              style={{ marginBottom: 12 }}
            />
            {pathsHint && (
              <>
                <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Data directory
                </div>
                <div className="path-line">{pathsHint.portfolioDataDir}</div>
                <div style={{ fontWeight: 600, color: "var(--text-secondary)", margin: "12px 0 6px" }}>
                  Knowledge base (RAG)
                </div>
                <div className="path-line">{pathsHint.knowledgeJsonPath}</div>
                <p className="muted-hint" style={{ marginTop: 12, marginBottom: 0 }}>
                  Align <code>PORTFOLIO_DATA_DIR</code> on the ATS server and portfolio API when you move folders.
                </p>
              </>
            )}
          </div>
        </details>

        <div style={{ marginTop: 24 }}>
          <label className="field-label" htmlFor="jd">
            Job description
          </label>
          <textarea
            id="jd"
            className="textarea-jd"
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full posting or load from the ATS browser extension."
          />
        </div>

        <div className="check-row">
          <input
            id="skip-llm"
            type="checkbox"
            checked={skipLlm}
            onChange={(e) => setSkipLlm(e.target.checked)}
          />
          <label htmlFor="skip-llm">
            <strong>Deterministic scoring only</strong> — skip LLM (faster; no AI rewrites or JD normalization).
          </label>
        </div>

        <div className="actions-row actions-row--analyze">
          <button type="button" className="btn btn-primary" disabled={loading} onClick={runAnalyze}>
            {loading ? "Analyzing…" : "Run analysis"}
          </button>
          {loading && (
            <span className="analysis-timer" aria-live="polite" aria-atomic="true">
              {formatAnalysisElapsed(analysisElapsedMs)}
            </span>
          )}
        </div>
        {err && <p className="error-text">{err}</p>}
      </section>

      {report && (
        <>
          <section className="panel">
            <p className="panel-title">Outcome</p>
            <h2 className="panel-headline">Score Assessment</h2>
            {report?.baselineAssessment ? (
              <div className="score-diff-container">
                <div className="score-card score-baseline">
                  <div className="score-label">Baseline (Raw Profile)</div>
                  <div className="score-value">{String((report.baselineAssessment as Record<string, unknown>).finalScore)}</div>
                  <div className="score-band" style={{ color: "var(--muted)" }}>{String((report.baselineAssessment as Record<string, unknown>).decisionBand).toUpperCase()}</div>
                </div>
                <div className="score-arrow">→</div>
                <div className="score-card score-tailored">
                  <div className="score-label">Tailored Profile</div>
                  <div className="score-value">{String((report.opportunityAssessment as Record<string, unknown>).finalScore)}</div>
                  <div className="score-band" style={{ color: "var(--success)" }}>{String((report.opportunityAssessment as Record<string, unknown>).decisionBand).toUpperCase()}</div>
                </div>
              </div>
            ) : (
              <p className="result-kicker">{band} ({report?.opportunityAssessment ? String((report.opportunityAssessment as Record<string, unknown>).finalScore) : '?'}/100)</p>
            )}
            
            {cal && (
              <div className="metrics-line">
                Brier (proxy): <strong>{String(cal.brierScore)}</strong> · ECE:{" "}
                <strong>{String(cal.expectedCalibrationError)}</strong> · n={String(cal.sampleCount)}
                <div style={{ marginTop: 8 }}>{String(cal.note)}</div>
              </div>
            )}
            {(() => {
              const bt = report.bandTailoring as Record<string, unknown> | undefined;
              if (!bt?.narrativeSuggestions) return null;
              const arr = bt.narrativeSuggestions as Array<{ suggestion?: string }>;
              if (!Array.isArray(arr) || arr.length === 0) return null;
              return (
                <div style={{ marginTop: 24 }}>
                  <p className="panel-title">Suggestions</p>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
                    {arr.slice(0, 12).map((s, i) => (
                      <li key={i} style={{ marginBottom: 8 }}>
                        {s.suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </section>

          <section className="panel">
            <p className="panel-title">Documents</p>
            <h2 className="panel-headline">Original vs Tailored Resume</h2>

            {/* Error banner */}
            {(originalPdfError || tailored?.pdfError) && (
              <div className="error-text" style={{ marginBottom: 16 }}>
                {originalPdfError && <p style={{ margin: "0 0 8px" }}><strong>Original PDF:</strong> {originalPdfError}</p>}
                {tailored?.pdfError && <p style={{ margin: 0 }}><strong>Tailored PDF:</strong> {tailored.pdfError}</p>}
              </div>
            )}

            {/* Synced PDF side-by-side */}
            <div className="pdf-sync-wrapper">
              {/* Column headers — sticky so always visible while scrolling */}
              <div className="pdf-sync-headers">
                <div className="pdf-sync-col-header pdf-sync-col-header--original">
                  <span className="pdf-sync-badge">Original</span>
                  <span className="pdf-sync-badge-hint">Read-only · Source LaTeX</span>
                </div>
                <div className="pdf-sync-col-header pdf-sync-col-header--tailored">
                  <span className="pdf-sync-badge pdf-sync-badge--tailored">Tailored</span>
                  <span className="pdf-sync-badge-hint">
                    {changeSummary
                      ? `${changeSummary.filter(c => diffWords(c.before, c.after).some(p => p.added || p.removed)).length} bullets improved ✦`
                      : skipLlm ? "Run with LLM enabled" : "Awaiting analysis"}
                  </span>
                </div>
              </div>

              {/* PDF viewer columns */}
              <div className="pdf-sync-grid">
                {/* LEFT — original */}
                <div className="pdf-sync-col">
                  <div className="pdf-sync-frame">
                    {originalPdfUrl ? (
                      <iframe title="Original PDF" src={originalPdfUrl} className="pdf-sync-iframe" />
                    ) : (
                      <div className="pdf-sync-empty">
                        {originalPdfError ? "Original PDF failed to compile." : "Run analysis to generate PDF."}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT — tailored */}
                <div className="pdf-sync-col">
                  <div className="pdf-sync-frame pdf-sync-frame--tailored">
                    {tailored?.pdfServeUrl ? (
                      <iframe title="Tailored PDF" src={tailored.pdfServeUrl} className="pdf-sync-iframe" />
                    ) : (
                      <div className="pdf-sync-empty">
                        {skipLlm
                          ? "Enable LLM for tailored output."
                          : "No tailored PDF yet — run analysis first."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Changes highlighted section */}
            {changeSummary && (
              <ResumeDiffPanel changes={changeSummary} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
