"use client";

import { ArrowLeft, ChevronDown, Download, FileText, Images, Loader2, RotateCcw, Settings2, Trash2, Upload, Workflow } from "lucide-react";
import { marked } from "marked";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_MODELS, DISABLED_PROVIDERS, type Provider, type StandardMessage } from "@/lib/providers";
import { parseExtract, parseReview, type ReviewNote } from "@/lib/refine/parser";
import { runPool } from "@/lib/refine/pool";
import { buildMergeReviewPrompt, buildPolishDocumentPrompt, EXTRACT_PROMPT, RECITATION_SAFE_EXTRACT_PROMPT } from "@/lib/refine/prompts";

type RefineImage = {
  id: string;
  name: string;
  dataUrl: string;
  mime: string;
  b64: string;
};

type ExtractedPart = {
  error: string | null;
  idx: number;
  md: string;
  name: string;
  ok: boolean;
  page: number | null;
};

type RefineResult = {
  count: number;
  extracted: string;
  notes: ReviewNote[];
  reviewed: string;
};

type StageKey = "extract" | "review" | "docx";
type StageState = Partial<Record<StageKey, "active" | "done">>;
type StageMeta = Partial<Record<StageKey, string>>;
type Status = { kind: "run" | "ok" | "err"; msg: string } | null;

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "OpenAI"
};

const DEFAULT_PROVIDER = "gemini" satisfies Exclude<Provider, "claude">;

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

function renderMarkdown(markdown: string) {
  try {
    return marked.parse(markdown || "", { async: false }) as string;
  } catch {
    return "<p>렌더링에 실패했습니다.</p>";
  }
}

function needsDocumentPolish(markdown: string) {
  const hasTable = /\|.+\|/.test(markdown);
  const lacksSummary = !/^##\s*핵심\s*요약\b/m.test(markdown);
  const lacksInterpretation = hasTable && !/^#{2,3}\s*(읽는\s*법|해석)\b/m.test(markdown);
  const hasSourceHeading = /^#{1,3}\s*(이미지\s*\d+|.+\.(jpg|jpeg|png|webp))\b/imu.test(markdown);
  return lacksSummary || lacksInterpretation || hasSourceHeading;
}

function isGeminiRecitationError(error: unknown) {
  return error instanceof Error && /Gemini.+RECITATION|RECITATION/i.test(error.message);
}

function fileNameFromMarkdown(markdown: string) {
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  return (heading || "refine-document").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80).trim() || "refine-document";
}

async function readImageFile(file: File): Promise<RefineImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });

  return {
    b64: dataUrl.split(",")[1] || "",
    dataUrl,
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    mime: file.type || "image/png",
    name: file.name
  };
}

export default function RefineWorkspace() {
  const fileRef = useRef<HTMLInputElement>(null);
  const modelSelectRef = useRef<HTMLDivElement>(null);
  const [provider, setProvider] = useState<Provider>(DEFAULT_PROVIDER);
  const [model, setModel] = useState(MODEL_OPTIONS[DEFAULT_PROVIDER][0].value);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [serverKeyProviders, setServerKeyProviders] = useState<Provider[]>([]);
  const [disabledProviders, setDisabledProviders] = useState<Provider[]>(DISABLED_PROVIDERS);
  const [images, setImages] = useState<RefineImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageState>({});
  const [stageMeta, setStageMeta] = useState<StageMeta>({});
  const [status, setStatus] = useState<Status>(null);
  const [result, setResult] = useState<RefineResult | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [tab, setTab] = useState<"reviewed" | "extracted" | "notes">("reviewed");
  const [rawView, setRawView] = useState(false);

  const hasServerKey = serverKeyProviders.includes(provider);
  const canRun = images.length > 0 && !running && !disabledProviders.includes(provider) && hasServerKey;
  const modelOptions = getModelOptions(provider);
  const selectedModel = modelOptions.find((option) => option.value === model) || modelOptions[0];
  const reviewedHtml = useMemo(() => renderMarkdown(result?.reviewed || ""), [result?.reviewed]);
  const extractedHtml = useMemo(() => renderMarkdown(result?.extracted || ""), [result?.extracted]);

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) return;
        const config = (await response.json()) as {
          disabledProviders?: Provider[];
          providersWithServerKey?: Provider[];
        };
        setServerKeyProviders(config.providersWithServerKey || []);
        setDisabledProviders(config.disabledProviders || DISABLED_PROVIDERS);
      } catch {
        setServerKeyProviders([]);
        setDisabledProviders(DISABLED_PROVIDERS);
      }
    }

    void loadConfig();
  }, []);

  function switchProvider(nextProvider: Provider) {
    setProvider(nextProvider);
    setModel(getModelOptions(nextProvider)[0]?.value || DEFAULT_MODELS[nextProvider]);
    setModelMenuOpen(false);
  }

  useEffect(() => {
    function closeModelMenu(event: MouseEvent) {
      if (!modelSelectRef.current?.contains(event.target as Node)) setModelMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setModelMenuOpen(false);
    }

    document.addEventListener("mousedown", closeModelMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeModelMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const addFiles = useCallback(async (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      setStatus({ kind: "err", msg: "PNG, JPG, WEBP 같은 이미지 파일을 선택하세요." });
      return;
    }

    try {
      const nextImages = await Promise.all(files.map(readImageFile));
      setImages((current) => [...current, ...nextImages].slice(0, 24));
      setStatus(null);
    } catch (error) {
      setStatus({ kind: "err", msg: error instanceof Error ? error.message : "이미지를 읽지 못했습니다." });
    }
  }, []);

  function removeImage(id: string) {
    setImages((current) => current.filter((image) => image.id !== id));
  }

  function resetAnalysis() {
    setImages([]);
    setDragOver(false);
    setRunning(false);
    setStages({});
    setStageMeta({});
    setStatus(null);
    setResult(null);
    setBlob(null);
    setTab("reviewed");
    setRawView(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function callAnalyze(messages: StandardMessage[], options: { maxTokens?: number } = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    const response = await fetch("/api/analyze", {
      body: JSON.stringify({
        maxTokens: options.maxTokens,
        messages,
        model: model.trim() || undefined,
        provider
      }),
      headers,
      method: "POST"
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      finishReason?: string;
      text?: string;
      truncated?: boolean;
    };
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (!data.text?.trim()) throw new Error("모델이 빈 응답을 반환했습니다.");
    if (data.truncated) {
      throw new Error(
        `모델 응답이 길어 중간에 잘렸습니다${data.finishReason ? ` (${data.finishReason})` : ""}. 이미지 수를 줄이거나 모델 출력 한도를 더 높여야 합니다.`
      );
    }
    return data.text.trim();
  }

  async function run() {
    if (disabledProviders.includes(provider)) {
      setStatus({ kind: "err", msg: `${PROVIDER_LABELS[provider]}는 현재 비활성화되어 있습니다.` });
      return;
    }
    if (!hasServerKey) {
      setStatus({ kind: "err", msg: `${PROVIDER_LABELS[provider]} 서버 키가 .env에 연결되어 있지 않습니다.` });
      return;
    }
    if (images.length === 0) {
      setStatus({ kind: "err", msg: "이미지를 먼저 올리세요." });
      return;
    }

    setRunning(true);
    setStages({ extract: "active" });
    setStageMeta({ extract: `0/${images.length}장` });
    setResult(null);
    setBlob(null);
    setRawView(false);

    try {
      setStatus({ kind: "run", msg: `${images.length}장에서 텍스트를 추출 중입니다. 0/${images.length}장` });
      const extractResults = await runPool(
        images,
        4,
        async (image) => {
          const messages = (prompt: string): StandardMessage[] => [
            {
              content: [
                { text: prompt, type: "text" },
                { data: image.b64, mediaType: image.mime, type: "image" }
              ],
              role: "user"
            }
          ];

          try {
            return await callAnalyze(messages(EXTRACT_PROMPT), { maxTokens: 4096 });
          } catch (error) {
            if (provider !== "gemini" || !isGeminiRecitationError(error)) throw error;
            setStatus({ kind: "run", msg: "Gemini가 원문 전사를 차단해 구조화 추출로 다시 시도 중입니다." });
            return callAnalyze(messages(RECITATION_SAFE_EXTRACT_PROMPT), { maxTokens: 4096 });
          }
        },
        (done, total) => {
          setStageMeta((current) => ({ ...current, extract: `${done}/${total}장` }));
          setStatus({ kind: "run", msg: `${total}장에서 텍스트를 추출 중입니다. ${done}/${total}장 완료` });
        }
      );

      const parts: ExtractedPart[] = extractResults.map((extractResult, index) => {
        if (!extractResult.ok) {
          return {
            error: extractResult.error.message,
            idx: index,
            md: "",
            name: images[index].name,
            ok: false,
            page: null
          };
        }
        const parsed = parseExtract(extractResult.value);
        return {
          error: null,
          idx: index,
          md: parsed.md,
          name: images[index].name,
          ok: true,
          page: parsed.page
        };
      });

      const okParts = parts.filter((part) => part.ok && part.md);
      const failed = parts.length - okParts.length;
      setStageMeta((current) => ({ ...current, extract: `성공 ${okParts.length}장${failed ? ` / 실패 ${failed}장` : ""}` }));
      if (okParts.length === 0) {
        const failedPart = parts.find((part) => !part.ok);
        throw new Error(`모든 이미지 추출 실패: ${failedPart?.error || "원인 불명"}`);
      }

      const detected = okParts.filter((part) => part.page !== null).length;
      const ordered = okParts.slice();
      let reordered = false;
      if (detected >= 2) {
        ordered.sort((a, b) => {
          const aKey = a.page ?? a.idx + 1;
          const bKey = b.page ?? b.idx + 1;
          return aKey === bKey ? a.idx - b.idx : aKey - bKey;
        });
        reordered = ordered.some((part, index) => part.idx !== okParts[index].idx);
      }

      const extracted = ordered
        .map((part) => `## ${part.page !== null ? `p.${part.page}` : `이미지 ${part.idx + 1}`} - ${part.name}\n\n${part.md}`)
        .join("\n\n---\n\n");
      setStages({ extract: "done", review: "active" });
      setStageMeta((current) => ({ ...current, review: detected >= 2 ? "쪽번호 기준 정렬" : "업로드 순서 유지" }));

      setStatus({ kind: "run", msg: `문서 순서와 문맥을 통합 검토 중입니다.${failed ? ` 추출 실패 ${failed}장 제외` : ""}` });
      const sections = ordered
        .map((part, index) => `[${index + 1}번째 - ${part.page !== null ? `원본 p.${part.page}` : "쪽번호 없음"} - ${part.name}]\n${part.md}`)
        .join("\n\n");
      const reviewRaw = await callAnalyze([
        {
          content: [{ text: buildMergeReviewPrompt(sections), type: "text" }],
          role: "user"
        }
      ], { maxTokens: 24000 });
      const { notes, reviewed } = parseReview(reviewRaw);
      let finalReviewed = reviewed || extracted;
      const finalNotes = [...notes];
      if (needsDocumentPolish(finalReviewed)) {
        setStatus({ kind: "run", msg: "검토본에 핵심 요약과 표 해석을 보강 중입니다." });
        setStageMeta((current) => ({ ...current, review: "해석 보강 중" }));
        finalReviewed = await callAnalyze([
          {
            content: [{ text: buildPolishDocumentPrompt(finalReviewed), type: "text" }],
            role: "user"
          }
        ], { maxTokens: 28000 });
        finalNotes.unshift({ detail: "핵심 요약과 표 해석 섹션을 보강했습니다.", type: "구조" });
      }
      if (reordered) finalNotes.unshift({ detail: `인쇄된 쪽번호 ${detected}장을 감지해 쪽번호 순으로 재정렬했습니다.`, type: "페이지" });
      else if (detected > 0) finalNotes.unshift({ detail: `쪽번호 ${detected}장 감지. 업로드 순서와 동일합니다.`, type: "페이지" });
      if (failed) finalNotes.unshift({ detail: `${failed}장이 추출에 실패해 통합에서 제외되었습니다.`, type: "확인필요" });
      setStages({ docx: "active", extract: "done", review: "done" });
      setStageMeta((current) => ({ ...current, docx: "문서 변환 중", review: `${finalNotes.length}개 메모` }));

      setStatus({ kind: "run", msg: "Word 문서를 생성 중입니다." });
      const { markdownToDocxBlob } = await import("@/lib/refine/md2docx");
      const docBlob = await markdownToDocxBlob(finalReviewed);

      setBlob(docBlob);
      setResult({ count: okParts.length, extracted, notes: finalNotes, reviewed: finalReviewed });
      setStages({ docx: "done", extract: "done", review: "done" });
      setStageMeta((current) => ({ ...current, docx: "다운로드 준비됨" }));
      setTab("reviewed");
      setStatus({ kind: "ok", msg: "완료되었습니다. 결과를 확인하고 Word 문서를 받을 수 있습니다." });
    } catch (error) {
      setStatus({ kind: "err", msg: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." });
      setStages((current) => {
        const next = { ...current };
        (Object.keys(next) as StageKey[]).forEach((key) => {
          if (next[key] === "active") delete next[key];
        });
        return next;
      });
      setStageMeta((current) => ({ ...current, extract: current.extract || "중단됨" }));
    } finally {
      setRunning(false);
    }
  }

  function download() {
    if (!blob) return;
    const name = fileNameFromMarkdown(result?.reviewed || "");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.download = `${name}.docx`;
    anchor.href = url;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <main className="refine-app">
      <header className="refine-topbar">
        <div className="refine-brand">
          <span className="refine-mark">Refine</span>
          <span>이미지를 Word로 정리</span>
        </div>
        <nav className="refine-actions" aria-label="작업 이동">
          <Link className="refine-nav-btn" href="/">
            <ArrowLeft size={17} aria-hidden="true" />
            작업 선택
          </Link>
          <Link className="refine-nav-btn" href="/pdf">
            <FileText size={17} aria-hidden="true" />
            PDF 분석
          </Link>
        </nav>
      </header>

      <div className="refine-layout">
        <section className="refine-panel refine-controls" aria-label="이미지 문서 생성 설정">
          <div className="refine-section-head">
            <div>
              <Settings2 size={18} aria-hidden="true" />
              <h2>모델 연결</h2>
            </div>
            <button
              className="refine-reset"
              disabled={running || (images.length === 0 && !result && !status)}
              onClick={resetAnalysis}
              type="button"
            >
              <RotateCcw size={15} aria-hidden="true" />
              새 분석
            </button>
          </div>

          <label className="refine-field">
            <span>제공자</span>
            <div className="refine-segment">
              {(["gemini", "openai"] as Provider[]).map((item) => (
                <button
                  className={provider === item ? "active" : ""}
                  disabled={running}
                  key={item}
                  onClick={() => switchProvider(item)}
                  type="button"
                >
                  {PROVIDER_LABELS[item]}
                </button>
              ))}
            </div>
          </label>

          <label className="refine-field">
            <span>모델</span>
            <div className={`model-select ${modelMenuOpen ? "open" : ""}`} ref={modelSelectRef}>
              <button
                aria-expanded={modelMenuOpen}
                className="model-select-trigger"
                disabled={running || modelOptions.length === 0}
                onClick={() => setModelMenuOpen((value) => !value)}
                type="button"
              >
                <span>
                  <strong>{selectedModel?.label || model}</strong>
                  <small>{selectedModel?.hint || model}</small>
                </span>
                <ChevronDown size={17} aria-hidden="true" />
              </button>
              {modelMenuOpen && (
                <div className="model-select-menu" role="listbox">
                  {modelOptions.map((option) => (
                    <button
                      aria-selected={option.value === model}
                      className={option.value === model ? "active" : ""}
                      key={option.value}
                      onClick={() => {
                        setModel(option.value);
                        setModelMenuOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>

          <div
            className={`refine-dropzone ${dragOver ? "over" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragLeave={() => setDragOver(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              void addFiles(event.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
          >
            <Upload size={24} aria-hidden="true" />
            <strong>이미지 선택</strong>
            <span>PNG / JPG / WEBP / 최대 24장</span>
          </div>
          <input
            accept="image/*"
            hidden
            multiple
            onChange={(event) => {
              void addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
            ref={fileRef}
            type="file"
          />

          {images.length > 0 && (
            <div className="refine-thumbs">
              {images.map((image, index) => (
                <div className="refine-thumb" key={image.id}>
                  <img alt={`${index + 1}번째 이미지`} src={image.dataUrl} />
                  <span>{index + 1}</span>
                  <button aria-label={`${image.name} 제거`} disabled={running} onClick={() => removeImage(image.id)} type="button">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button className="refine-run" disabled={!canRun} onClick={() => void run()} type="button">
            {running ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Images size={18} aria-hidden="true" />}
            {running ? "처리 중" : "분석 시작"}
          </button>
        </section>

        <section className="refine-results" aria-label="처리 결과">
          <div className="refine-panel refine-pipeline">
            <div className="refine-pipeline-head">
              <div>
                <Workflow size={18} aria-hidden="true" />
                <strong>생성 파이프라인</strong>
              </div>
            </div>
            <div className="refine-stage-track">
              <Stage detail={stageMeta.extract || "장별 OCR"} index={1} state={stages.extract} title="병렬 추출" />
              <Stage detail={stageMeta.review || "순서·문맥 정리"} index={2} state={stages.review} title="통합 검토" />
              <Stage detail={stageMeta.docx || "Word 파일 준비"} index={3} state={stages.docx} title="docx 생성" />
            </div>
          </div>

          {status && (
            <div className={`refine-status ${status.kind}`}>
              {status.kind === "run" && <Loader2 className="spin-icon" size={16} aria-hidden="true" />}
              <span>{status.msg}</span>
            </div>
          )}

          <div className="refine-panel refine-output">
            {!result ? (
              <div className="refine-empty">
                <Images size={32} aria-hidden="true" />
                <p>이미지를 올리면 추출본과 생성 상태가 표시됩니다.</p>
              </div>
            ) : (
              <>
                <div className="refine-tabs">
                  <button className={tab === "reviewed" ? "active" : ""} onClick={() => setTab("reviewed")} type="button">
                    검토본·해석
                  </button>
                  <button className={tab === "extracted" ? "active" : ""} onClick={() => setTab("extracted")} type="button">
                    추출본 <span>{result.count}</span>
                  </button>
                  <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")} type="button">
                    변경 사항 <span>{result.notes.length}</span>
                  </button>
                  <button className="download" disabled={!blob} onClick={download} type="button">
                    <Download size={16} aria-hidden="true" />
                    docx
                  </button>
                </div>

                {tab !== "notes" && (
                  <div className="refine-view-toggle">
                    <button onClick={() => setRawView((value) => !value)} type="button">
                      {rawView ? "서식 보기" : "원문 보기"}
                    </button>
                  </div>
                )}

                {tab === "reviewed" && (
                  rawView ? (
                    <pre className="refine-raw">{result.reviewed}</pre>
                  ) : (
                    <article className="refine-render" dangerouslySetInnerHTML={{ __html: reviewedHtml }} />
                  )
                )}

                {tab === "extracted" && (
                  rawView ? (
                    <pre className="refine-raw">{result.extracted}</pre>
                  ) : (
                    <article className="refine-render" dangerouslySetInnerHTML={{ __html: extractedHtml }} />
                  )
                )}

                {tab === "notes" && (
                  <ul className="refine-notes">
                    {result.notes.length === 0 && <li>변경 사항이 없습니다.</li>}
                    {result.notes.map((note, index) => (
                      <li key={`${note.type}-${index}`}>
                        <strong>{note.type}</strong>
                        <span>{note.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stage({ detail, index, state, title }: { detail: string; index: number; state?: "active" | "done"; title: string }) {
  return (
    <div className={`refine-stage ${state || ""}`}>
      <span aria-hidden="true">{state === "done" ? "✓" : state === "active" ? <i /> : index}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
