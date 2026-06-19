"use client";

import { Braces, FileCode2, FileDown, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { PROVIDER_INFO } from "@/lib/pdf-workspace/constants";
import type { AiSettings, Provider } from "@/lib/pdf-workspace/types";

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
  onDownloadJson,
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
  onDownloadJson: () => void;
  onDownloadHtml: () => void;
}) {
  const currentProviderInfo = PROVIDER_INFO[draftAi.provider];
  const currentProviderDisabled = disabledProviders.includes(draftAi.provider);
  const providerHasServerKey = serverKeyProviders.includes(draftAi.provider);

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
              <select
                value={draftAi.provider}
                onChange={(event) => setDraftAi((prev) => ({ ...prev, provider: event.target.value as Provider }))}
              >
                {Object.entries(PROVIDER_INFO).map(([provider, info]) => (
                  <option disabled={disabledProviders.includes(provider as Provider)} key={provider} value={provider}>
                    {info.label}
                    {disabledProviders.includes(provider as Provider) ? " (비활성)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>모델 <em>(비워두면 기본값)</em></span>
              <input
                value={draftAi.model}
                onChange={(event) => setDraftAi((prev) => ({ ...prev, model: event.target.value }))}
                placeholder={`예: ${currentProviderInfo.model}`}
              />
            </label>

            <label className="field">
              <span>API 키 <em>{providerHasServerKey ? "(서버에 설정됨)" : ""}</em></span>
              <input
                type="password"
                value={providerHasServerKey ? "" : draftAi.key}
                disabled={providerHasServerKey || currentProviderDisabled}
                onChange={(event) => setDraftAi((prev) => ({ ...prev, key: event.target.value }))}
                placeholder="sk-... / AIza..."
              />
            </label>

            <p className="note">
              {currentProviderDisabled
                ? `${currentProviderInfo.label}는 현재 비활성화되어 있어요. OpenAI 또는 Gemini를 사용하세요.`
                : providerHasServerKey
                  ? `${currentProviderInfo.keyName}가 서버에 이미 설정돼 있어요. 키를 입력하지 않아도 됩니다.`
                  : `${currentProviderInfo.keyName}를 입력하세요. 키는 브라우저 메모리에만 보관되고 새로고침하면 사라집니다.`}
            </p>
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
              <button className="action-btn" disabled={!hasPdf || clipCount === 0} onClick={onDownloadJson}>
                <Braces size={18} />
                <span>JSON</span>
              </button>
              <button className="action-btn" disabled={!hasPdf || clipCount === 0} onClick={onDownloadHtml}>
                <FileCode2 size={18} />
                <span>HTML 리포트</span>
              </button>
            </div>
            <p className="note">HTML 리포트는 브라우저에서 바로 열어 읽기 좋고, JSON은 재가공이나 백업에 적합합니다.</p>
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
