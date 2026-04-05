/* global chrome */
(function () {
  if (window.__atsEngineContentLoaded) return;
  window.__atsEngineContentLoaded = true;

  const BTN_ID = "ats-engine-fab";
  const PANEL_ID = "ats-engine-panel";
  const SERVER_UI = "http://127.0.0.1:3847/";

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "ATS";
    btn.setAttribute(
      "style",
      [
        "position:fixed",
        "right:12px",
        "top:50%",
        "transform:translateY(-50%)",
        "z-index:2147483646",
        "width:40px",
        "height:40px",
        "border-radius:10px",
        "border:none",
        "cursor:pointer",
        "font-size:11px",
        "font-weight:700",
        "letter-spacing:0.02em",
        "color:#fff",
        "background:linear-gradient(145deg,#1e3a5f,#0d1b2a)",
        "box-shadow:0 4px 14px rgba(0,0,0,0.25)",
        "font-family:system-ui,-apple-system,sans-serif",
      ].join(";")
    );
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePanel();
    });
    document.documentElement.appendChild(btn);
  }

  function removePanel() {
    const p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  function togglePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      removePanel();
      return;
    }
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute(
      "style",
      [
        "position:fixed",
        "right:56px",
        "top:50%",
        "transform:translateY(-50%)",
        "z-index:2147483647",
        "width:min(420px,calc(100vw - 72px))",
        "max-height:70vh",
        "display:flex",
        "flex-direction:column",
        "gap:10px",
        "padding:14px",
        "background:#0f172a",
        "color:#e2e8f0",
        "border-radius:12px",
        "box-shadow:0 12px 40px rgba(0,0,0,0.35)",
        "font-family:system-ui,-apple-system,sans-serif",
        "font-size:13px",
      ].join(";")
    );

    const title = document.createElement("div");
    title.textContent = "Job description (edit before send)";
    title.style.fontWeight = "600";

    const ta = document.createElement("textarea");
    const sel = window.getSelection()?.toString()?.trim();
    const seed =
      sel && sel.length > 40
        ? sel
        : (document.body?.innerText || "").slice(0, 120000);
    ta.value = seed;
    ta.setAttribute(
      "style",
      "width:100%;min-height:180px;max-height:38vh;resize:vertical;padding:10px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#f1f5f9;font-size:12px;box-sizing:border-box;"
    );

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.justifyContent = "flex-end";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.style.cssText =
      "padding:8px 12px;border-radius:8px;border:1px solid #475569;background:transparent;color:#e2e8f0;cursor:pointer;";
    closeBtn.addEventListener("click", () => removePanel());

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.textContent = "Open ATS UI";
    openBtn.style.cssText =
      "padding:8px 14px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;";
    openBtn.addEventListener("click", () => {
      const text = ta.value.trim();
      const url =
        SERVER_UI +
        "?jd=" +
        encodeURIComponent(text) +
        "&src=" +
        encodeURIComponent(location.hostname);
      chrome.runtime.sendMessage({ type: "ATS_OPEN_TAB", url });
      removePanel();
    });

    row.appendChild(closeBtn);
    row.appendChild(openBtn);
    panel.appendChild(title);
    panel.appendChild(ta);
    panel.appendChild(row);
    document.documentElement.appendChild(panel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureButton);
  } else {
    ensureButton();
  }
})();
