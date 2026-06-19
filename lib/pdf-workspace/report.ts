import { PROVIDER_INFO } from "@/lib/pdf-workspace/constants";
import { escapeHtml, renderMarkdown } from "@/lib/pdf-workspace/format";
import type { AnalysisExport } from "@/lib/pdf-workspace/types";

/** 분석 내보내기 페이로드를 단일 HTML 리포트 문자열로 만든다. */
export function buildReportHtml(payload: AnalysisExport): string {
  const title = payload.document.fileName || "Analysis Report";
  const summaryHtml = payload.summary
    ? `
        <section class="summary">
          <div class="eyebrow">Document Summary</div>
          ${payload.summary.overview ? `<p class="summary-lead">${escapeHtml(payload.summary.overview)}</p>` : ""}
          ${
            payload.summary.sections.length
              ? `<ul class="summary-list">${payload.summary.sections
                  .map(
                    (section) =>
                      `<li><span class="st">${escapeHtml(section.title)}</span><span class="sp">${escapeHtml(
                        section.point
                      )}</span></li>`
                  )
                  .join("")}</ul>`
              : ""
          }
        </section>`
    : "";

  const clipHtml = payload.clips.length
    ? payload.clips
        .map(
          (clip) => `
              <article class="clip">
                <header>
                  <span>Selection ${clip.id}</span>
                  <strong>Page ${clip.pageNo}</strong>
                </header>
                <img src="${clip.image}" alt="Page ${clip.pageNo} selected area" />
                ${
                  clip.extractedText
                    ? `<section><h2>Extracted Text</h2><pre>${escapeHtml(clip.extractedText)}</pre></section>`
                    : `<p class="muted">No text layer was extracted from this selection.</p>`
                }
                <section>
                  <h2>Analysis</h2>
                  ${
                    clip.turns.length
                      ? clip.turns
                          .map(
                            (turn) => `
                              <div class="turn ${turn.role}">
                                <b>${turn.role === "user" ? "Question" : turn.role === "assistant" ? "Answer" : "Status"}</b>
                                ${
                                  turn.truncated
                                    ? `<p class="warning">This response may be incomplete because the model stopped at its output limit${
                                        turn.finishReason ? ` (${escapeHtml(turn.finishReason)})` : ""
                                      }.</p>`
                                    : ""
                                }
                                <div>${turn.role === "assistant" ? renderMarkdown(turn.text) : `<p>${escapeHtml(turn.text)}</p>`}</div>
                              </div>
                            `
                          )
                          .join("")
                      : `<p class="muted">No analysis has been generated for this selection yet.</p>`
                  }
                </section>
              </article>
            `
        )
        .join("")
    : `<p class="empty-report">No selected areas or analysis results were exported.</p>`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink:#1c2230; --muted:#687083; --line:#e6e2d8; --paper:#f7f5ef; --accent:#3552e0; }
    body { margin:0; background:var(--paper); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.65; }
    main { max-width:980px; margin:0 auto; padding:48px 24px 72px; }
    .hero { margin-bottom:28px; }
    .eyebrow { color:var(--accent); font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    h1 { font-size:32px; line-height:1.2; margin:8px 0 10px; }
    .meta { color:var(--muted); display:flex; flex-wrap:wrap; gap:12px; font-size:14px; }
    .summary { background:#fff; border:1px solid var(--line); border-radius:8px; margin-bottom:24px; padding:22px 24px; }
    .summary-lead { border-left:3px solid var(--accent); font-size:17px; font-weight:600; line-height:1.5; margin:10px 0 0; padding-left:14px; }
    .summary-list { border-top:1px solid var(--line); display:grid; gap:14px; list-style:none; margin:18px 0 0; padding:18px 0 0; }
    .summary-list li { display:grid; gap:3px; }
    .summary-list .st { color:var(--accent); font-size:12px; font-weight:800; letter-spacing:.04em; }
    .summary-list .sp { color:var(--ink); font-size:14px; line-height:1.5; }
    .clip { background:#fff; border:1px solid var(--line); border-radius:8px; margin-top:20px; overflow:hidden; }
    .clip header { align-items:center; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; padding:14px 18px; }
    .clip header span { color:var(--accent); font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .clip img { border-bottom:1px solid var(--line); display:block; max-width:100%; width:100%; }
    section { padding:18px; }
    h2 { font-size:15px; margin:0 0 10px; }
    pre { background:#f8f8f8; border:1px solid var(--line); border-radius:6px; overflow:auto; padding:12px; white-space:pre-wrap; }
    .turn { border-top:1px solid var(--line); padding:14px 0; }
    .turn:first-child { border-top:0; }
    .turn b { color:var(--accent); display:block; font-size:12px; margin-bottom:6px; text-transform:uppercase; }
    .turn.user b { color:#5a6275; }
    .turn.error { color:#b42318; }
    .warning { background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; color:#9a3412; margin:0 0 10px; padding:9px 10px; }
    .muted, .empty-report { color:var(--muted); }
    table { border-collapse:collapse; width:100%; }
    th, td { border:1px solid var(--line); padding:6px 8px; text-align:left; }
    code { background:#f0efe9; border-radius:4px; padding:1px 5px; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">PDF Analysis Report</div>
      <h1>${escapeHtml(payload.document.fileName || "Untitled document")}</h1>
      <div class="meta">
        <span>Exported ${new Date(payload.document.exportedAt).toLocaleString()}</span>
        <span>${escapeHtml(PROVIDER_INFO[payload.ai.provider].label)}</span>
        <span>${escapeHtml(payload.ai.model)}</span>
        <span>${payload.clips.length} selections</span>
      </div>
    </section>
    ${summaryHtml}
    ${clipHtml}
  </main>
</body>
</html>`;
}
