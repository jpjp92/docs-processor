"use client";

import { ChevronDown, FileCode2, FileDown, FileText, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { PROVIDER_INFO } from "@/lib/pdf-workspace/constants";
import type { AiSettings, Provider } from "@/lib/pdf-workspace/types";

const MODEL_OPTIONS: Record<Exclude<Provider, "claude">, Array<{ label: string; value: string; hint: string }>> = {
  gemini: [
    { label: "Gemini 3.5 Flash", value: "gemini-3.5-flash", hint: "최신 Flash / 고품질" },
    { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash", hint: "안정적 / 빠른 처리" }
  ],
  openai: [
    { label: "GPT-5.4 mini", value: "gpt-5.4-mini", hint: "추천 / 비용·속도 균형" },
    { label: "GPT-5.4", value: "gpt-5.4", hint: "고품질 / 5.5보다 절약" }
  ]
};

function getModelOptions(provider: Provider) {
  return provider === "openai" || provider === "gemini" ? MODEL_OPTIONS[provider] : [];
}

export default function SettingsModal({
  draftAi,
  setDraftAi,
  serverKeyProviders,
  disabledProviders,
  onSave,
  onClose,
  hasPdf,
  hasFileBytes,
  clipCount,
  onDownloadOriginal,
  onDownloadDocx,
  onDownloadHtml
}: {
  draftAi: AiSettings;
  setDraftAi: Dispatch<SetStateAction<AiSettings>>;
  serverKeyProviders: Provider[];
  disabledProviders: Provider[];
  onSave: () => void;
  onClose: () => void;
  hasPdf: boolean;
  hasFileBytes: boolean;
  clipCount: number;
  onDownloadOriginal: () => void;
  onDownloadDocx: () => void;
  onDownloadHtml: () => void;
}) {
  const currentProviderInfo = PROVIDER_INFO[draftAi.provider];
  const currentProviderDisabled = disabledProviders.includes(draftAi.provider);
  const providerHasServerKey = serverKeyProviders.includes(draftAi.provider);
  const modelOptions = getModelOptions(draftAi.provider);
  const selectedModel = modelOptions.find((option) => option.value === draftAi.model) || modelOptions[0];

  function selectProvider(provider: Provider) {
    const nextModel = getModelOptions(provider)[0]?.value || PROVIDER_INFO[provider].model;
    setDraftAi((prev) => ({ ...prev, model: nextModel, provider }));
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>설정</h2>
          <button className="x" aria-label="설정 닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <section className="settings-section">
            <h3>AI 설정</h3>
            <label className="field">
              <span>AI 프로바이더</span>
              <div className="settings-segment">
                {(["gemini", "openai"] as Provider[]).map((provider) => (
                  <button
                    className={draftAi.provider === provider ? "active" : ""}
                    disabled={disabledProviders.includes(provider)}
                    key={provider}
                    onClick={() => selectProvider(provider)}
                    type="button"
                  >
                    {PROVIDER_INFO[provider].label.replace(/\s*\(.+\)$/, "")}
                  </button>
                ))}
              </div>
            </label>

            <label className="field">
              <span>모델</span>
              <details className="settings-model-select">
                <summary>
                  <span>
                    <strong>{selectedModel?.label || draftAi.model || currentProviderInfo.model}</strong>
                    <small>{selectedModel?.hint || currentProviderInfo.model}</small>
                  </span>
                  <ChevronDown size={17} aria-hidden="true" />
                </summary>
                <div className="settings-model-menu">
                  {modelOptions.map((option) => (
                    <button
                      className={option.value === draftAi.model ? "active" : ""}
                      key={option.value}
                      onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        setDraftAi((prev) => ({ ...prev, model: option.value }));
                      }}
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </button>
                  ))}
                </div>
              </details>
            </label>

            {currentProviderDisabled && <p className="note">{currentProviderInfo.label}는 현재 비활성화되어 있어요. OpenAI 또는 Gemini를 사용하세요.</p>}
            {!currentProviderDisabled && !providerHasServerKey && <p className="note">{currentProviderInfo.keyName}가 서버 .env에 연결되어 있지 않습니다.</p>}
          </section>

          <section className="settings-section">
            <h3>문서</h3>
            <div className="action-grid">
              <button className="action-btn" disabled={!hasPdf || !hasFileBytes} onClick={onDownloadOriginal}>
                <FileDown size={18} />
                <span>원본 PDF</span>
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>분석 내보내기</h3>
            <div className="action-grid">
              <button className="action-btn" disabled={!hasPdf || clipCount === 0} onClick={onDownloadDocx}>
                <FileText size={18} />
                <span>Word 리포트</span>
              </button>
              <button className="action-btn" disabled={!hasPdf || clipCount === 0} onClick={onDownloadHtml}>
                <FileCode2 size={18} />
                <span>HTML 리포트</span>
              </button>
            </div>
            <p className="note">Word 리포트는 공유와 편집에 적합하고, HTML 리포트는 브라우저에서 바로 열어 읽기 좋습니다.</p>
          </section>
        </div>
        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>
            취소
          </button>
          <button className="primary" disabled={currentProviderDisabled} onClick={onSave}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
