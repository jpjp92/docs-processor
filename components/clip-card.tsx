"use client";

import { Loader2, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { PRESET_LABELS, PRESETS } from "@/lib/pdf-workspace/constants";
import { renderMarkdown } from "@/lib/pdf-workspace/format";
import type { Clip } from "@/lib/pdf-workspace/types";

export default function ClipCard({
  clip,
  number,
  active,
  onFocus,
  onHover,
  onDelete,
  onAnalyze,
  onAsk
}: {
  clip: Clip;
  number: number;
  active: boolean;
  onFocus: () => void;
  onHover: (active: boolean) => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onAsk: (question: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const textBadge = clip.extractedText ? `텍스트 ${clip.extractedText.length}자 추출됨` : "이미지만";

  return (
    <article
      className={`clip ${active ? "active" : ""}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="clip-head" onClick={onFocus}>
        <div className="clip-title">
          <span className="badge-num">{number}</span>
          <div>
            <strong>p.{clip.pageNo}</strong>
            <span>{textBadge}</span>
          </div>
        </div>
        <button
          className="clip-delete"
          aria-label="선택 영역 삭제"
          title="삭제"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <button className="clip-preview" onClick={onFocus}>
        <img src={clip.dataUrl} alt={`p.${clip.pageNo} 선택 영역`} />
      </button>

      {!clip.started && (
        <button className="analyze-btn" disabled={clip.loading} onClick={onAnalyze}>
          {clip.loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          <span>{clip.loading ? "분석 중" : "이 영역 분석"}</span>
        </button>
      )}

      {(clip.started || clip.turns.length > 0) && (
        <>
          <div className="thread">
            {clip.turns.map((turn, index) => (
              <div key={`${turn.role}-${index}`} className={`turn ${turn.role === "assistant" ? "ai" : turn.role}`}>
                <span className="who">{turn.role === "user" ? "나" : "AI"}</span>
                {turn.truncated && (
                  <div className="turn-warning">
                    응답이 출력 한도 때문에 잘렸을 수 있습니다
                    {turn.finishReason ? ` (${turn.finishReason})` : ""}.
                  </div>
                )}
                {turn.role === "assistant" ? (
                  <div className="body" dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.text) }} />
                ) : (
                  <div className="body">{turn.text}</div>
                )}
              </div>
            ))}
            {clip.loading && (
              <div className="turn thinking">
                <span className="who">AI</span>
                <div className="thinking-row">
                  <Loader2 className="spin" size={15} />
                  <span>선택 영역을 읽고 있습니다</span>
                </div>
              </div>
            )}
          </div>

          <div className="preset-row">
            {clip.turns.some((turn) => turn.truncated) && (
              <button disabled={clip.loading} onClick={() => onAsk("방금 답변이 중간에 끊겼어. 앞의 내용을 반복하지 말고 끊긴 지점부터 이어서 완성해줘.")}>
                이어서 받기
              </button>
            )}
            {PRESETS.map((preset, index) => (
              <button key={preset} disabled={clip.loading} onClick={() => onAsk(preset)}>
                {PRESET_LABELS[index]}
              </button>
            ))}
          </div>

          <form
            className="followup"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = question.trim();
              if (!trimmed) return;
              setQuestion("");
              onAsk(trimmed);
            }}
          >
            <textarea
              rows={1}
              value={question}
              disabled={clip.loading}
              placeholder="이 영역에 대해 더 물어보기..."
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button className="send" disabled={clip.loading || !question.trim()} aria-label="질문 보내기">
              <SendHorizontal size={17} />
            </button>
          </form>
        </>
      )}
    </article>
  );
}
