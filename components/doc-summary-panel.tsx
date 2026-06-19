"use client";

import { Loader2, Sparkles } from "lucide-react";

import type { SummaryState } from "@/lib/pdf-workspace/types";

export default function DocSummaryPanel({
  summary,
  onRun,
  canRun
}: {
  summary: SummaryState;
  onRun: () => void;
  canRun: boolean;
}) {
  return (
    <div className="doc-summary">
      <div className="doc-summary-head">
        <h3>문서 전체 요약</h3>
        <button type="button" className="summary-run" onClick={onRun} disabled={summary.loading || !canRun}>
          {summary.loading ? (
            <>
              <Loader2 size={14} className="spin" /> 요약 중…
            </>
          ) : (
            <>
              <Sparkles size={14} /> 요약 생성
            </>
          )}
        </button>
      </div>
      {summary.error && <div className="summary-error">{summary.error}</div>}
      {(summary.overview || summary.sections.length > 0) && (
        <div className="summary-card">
          {summary.overview && <p className="summary-overview">{summary.overview}</p>}
          {summary.sections.length > 0 && (
            <ul className="summary-sections">
              {summary.sections.map((section, index) => (
                <li key={index}>
                  <span className="sec-title">{section.title}</span>
                  <span className="sec-point">{section.point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!summary.loading && !summary.error && !summary.overview && summary.sections.length === 0 && (
        <div className="hint">문서 전체를 한 줄 개요와 섹션별 핵심(최대 10개)으로 요약합니다.</div>
      )}
    </div>
  );
}
