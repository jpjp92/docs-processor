"use client";

import { FilePlus2, Images, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import ClipCard from "@/components/clip-card";
import DocSummaryPanel from "@/components/doc-summary-panel";
import SettingsModal from "@/components/settings-modal";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useSummary } from "@/hooks/use-summary";
import { DEFAULT_ANALYSIS_PROMPT, PROVIDER_INFO } from "@/lib/pdf-workspace/constants";
import { downloadTextFile, safeFileStem } from "@/lib/pdf-workspace/format";
import { loadPdfJs } from "@/lib/pdf-workspace/pdfjs";
import { buildReportHtml } from "@/lib/pdf-workspace/report";
import type { AnalysisExport, Clip, MessagePart, PdfDocument, PdfPage } from "@/lib/pdf-workspace/types";

type PageThumb = {
  page: number;
  url: string | null;
};

export default function PdfWorkspace() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const pendingScrollRatioRef = useRef<{ left: number; top: number } | null>(null);
  const thumbBuildIdRef = useRef(0);

  const [pdfJsReady, setPdfJsReady] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [fileName, setFileName] = useState("");
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [activeClipId, setActiveClipId] = useState<number | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [currentPageProxy, setCurrentPageProxy] = useState<PdfPage | null>(null);
  const [currentViewport, setCurrentViewport] = useState<{ transform: number[] } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; cur?: { x: number; y: number } } | null>(null);
  const [thumbWidth, setThumbWidth] = useState(168);
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const [resizeTarget, setResizeTarget] = useState<"thumbs" | "inspector" | null>(null);
  const [error, setError] = useState("");

  const totalPages = pdfDoc?.numPages || 0;
  const {
    ai,
    draftAi,
    setDraftAi,
    serverKeyProviders,
    disabledProviders,
    settingsOpen,
    openSettings,
    saveSettings,
    closeSettings
  } = useAiSettings();
  const { summary, runSummary, resetSummary } = useSummary({ ai, disabledProviders, pdfDoc });

  const visibleClips = useMemo(
    () => clips.filter((clip) => clip.pageNo === currentPage),
    [clips, currentPage]
  );

  useEffect(() => {
    loadPdfJs()
      .then(() => setPdfJsReady(true))
      .catch((loadError) => setError(loadError.message));

    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!pdfDoc || !pdfJsReady) return;
    void renderPage(pdfDoc, currentPage, scale);
  }, [pdfDoc, currentPage, scale, pdfJsReady]);

  useEffect(() => {
    if (!resizeTarget) return;

    function handleResizeMove(event: PointerEvent) {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const bounds = workspace.getBoundingClientRect();

      if (resizeTarget === "thumbs") {
        setThumbWidth(Math.min(Math.max(event.clientX - bounds.left, 120), 260));
        return;
      }

      setInspectorWidth(Math.min(Math.max(bounds.right - event.clientX, 280), 560));
    }

    function stopResize() {
      setResizeTarget(null);
    }

    document.body.classList.add("is-resizing-layout");
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      document.body.classList.remove("is-resizing-layout");
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [resizeTarget]);

  async function renderPage(doc: PdfDocument, pageNumber: number, nextScale: number) {
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!canvas || !textLayer || !window.pdfjsLib) return;

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: nextScale });
    const dpr = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    setPageSize({ width: viewport.width, height: viewport.height });

    await page.render({
      canvasContext: context,
      viewport,
      transform: [dpr, 0, 0, dpr, 0, 0]
    }).promise;

    await renderTextLayer(page, viewport, textLayer);
    setCurrentPageProxy(page);
    setCurrentViewport(viewport);

    requestAnimationFrame(() => {
      const scrollRatio = pendingScrollRatioRef.current;
      const canvasArea = canvasAreaRef.current;
      if (!scrollRatio || !canvasArea) return;

      pendingScrollRatioRef.current = null;
      canvasArea.scrollLeft =
        scrollRatio.left * Math.max(0, canvasArea.scrollWidth - canvasArea.clientWidth);
      canvasArea.scrollTop =
        scrollRatio.top * Math.max(0, canvasArea.scrollHeight - canvasArea.clientHeight);
    });
  }

  async function renderTextLayer(page: PdfPage, viewport: { width: number; height: number; transform: number[] }, layer: HTMLDivElement) {
    if (!window.pdfjsLib) return;
    layer.innerHTML = "";
    layer.style.width = `${viewport.width}px`;
    layer.style.height = `${viewport.height}px`;

    const content = await page.getTextContent();
    const fragment = document.createDocumentFragment();

    content.items.forEach((item) => {
      if (!item.str) return;
      const matrix = window.pdfjsLib!.Util.transform(viewport.transform, item.transform);
      const span = document.createElement("span");
      const fontHeight = Math.hypot(matrix[2], matrix[3]);
      span.textContent = item.str;
      span.style.left = `${matrix[4]}px`;
      span.style.top = `${matrix[5] - fontHeight}px`;
      span.style.fontSize = `${fontHeight}px`;
      span.style.fontFamily = "sans-serif";
      span.dataset.w = `${item.width * scale}`;
      fragment.appendChild(span);
    });

    layer.appendChild(fragment);

    requestAnimationFrame(() => {
      layer.querySelectorAll<HTMLSpanElement>("span").forEach((span) => {
        const target = Number(span.dataset.w || 0);
        const actual = span.getBoundingClientRect().width;
        if (actual > 0 && target > 0) {
          span.style.transform = `scaleX(${target / actual})`;
        }
      });
    });
  }

  async function loadFile(file: File) {
    if (!window.pdfjsLib) return;
    setError("");
    const buffer = await file.arrayBuffer();
    const preserved = buffer.slice(0);
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const objectUrl = URL.createObjectURL(new Blob([preserved], { type: "application/pdf" }));
    const doc = await window.pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;

    setFileName(file.name);
    setFileBytes(preserved);
    setFileUrl(objectUrl);
    setPdfDoc(doc);
    setCurrentPage(1);
    setClips([]);
    const thumbBuildId = thumbBuildIdRef.current + 1;
    thumbBuildIdRef.current = thumbBuildId;
    setThumbs(Array.from({ length: doc.numPages }, (_, index) => ({ page: index + 1, url: null })));
    resetSummary();
    void buildThumbs(doc, thumbBuildId);
  }

  async function buildThumbs(doc: PdfDocument, buildId: number) {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (thumbBuildIdRef.current !== buildId) return;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) continue;
      await page.render({ canvasContext: context, viewport }).promise;
      if (thumbBuildIdRef.current !== buildId) return;
      const url = canvas.toDataURL("image/png");
      setThumbs((current) =>
        current.map((thumb) => (thumb.page === pageNumber ? { ...thumb, url } : thumb))
      );
    }
  }

  function downloadOriginal() {
    if (!fileBytes) return;
    const url = URL.createObjectURL(new Blob([fileBytes], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName || "document.pdf";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function resetDocument() {
    thumbBuildIdRef.current += 1;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setPdfDoc(null);
    setCurrentPage(1);
    setScale(1.2);
    setFileName("");
    setFileBytes(null);
    setFileUrl("");
    setThumbs([]);
    setClips([]);
    resetSummary();
    setSelecting(false);
    setActiveClipId(null);
    setInspectorOpen(false);
    setCurrentPageProxy(null);
    setCurrentViewport(null);
    setPageSize({ width: 0, height: 0 });
    setDrag(null);
    closeSettings();
    pendingScrollRatioRef.current = null;
    if (canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      context?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (textLayerRef.current) textLayerRef.current.innerHTML = "";
  }

  function buildAnalysisExport(): AnalysisExport {
    return {
      document: {
        fileName: fileName || null,
        totalPages,
        exportedAt: new Date().toISOString()
      },
      ai: {
        provider: ai.provider,
        model: ai.model || PROVIDER_INFO[ai.provider].model
      },
      summary:
        summary.overview || summary.sections.length > 0
          ? { overview: summary.overview, sections: summary.sections }
          : null,
      clips: clips
        .slice()
        .reverse()
        .map((clip, index) => ({
          id: index + 1,
          pageNo: clip.pageNo,
          extractedText: clip.extractedText,
          image: clip.dataUrl,
          turns: clip.turns
        }))
    };
  }

  async function downloadAnalysisDocx() {
    const payload = buildAnalysisExport();
    const { analysisToDocxBlob } = await import("@/lib/pdf-workspace/docx-report");
    const blob = await analysisToDocxBlob(payload);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileStem(fileName)}-analysis.docx`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadAnalysisHtml() {
    const html = buildReportHtml(buildAnalysisExport());
    downloadTextFile(`${safeFileStem(fileName)}-analysis.html`, html, "text/html;charset=utf-8");
  }

  async function extractTextInRect(rect: Clip["rect"]) {
    if (!currentPageProxy || !currentViewport || !window.pdfjsLib) return "";

    try {
      const content = await currentPageProxy.getTextContent();
      const lines: Array<{ y: number; x: number; str: string }> = [];

      content.items.forEach((item) => {
        if (!item.str?.trim()) return;
        const matrix = window.pdfjsLib!.Util.transform(currentViewport.transform, item.transform);
        const x = matrix[4];
        const baseline = matrix[5];
        const height = Math.hypot(matrix[2], matrix[3]) || item.height * scale;
        const width = item.width * scale;
        const top = baseline - height;
        const overlap = !(x + width < rect.x || x > rect.x + rect.w || baseline < rect.y || top > rect.y + rect.h);
        if (overlap) lines.push({ y: top, x, str: item.str || "" });
      });

      lines.sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x));

      let output = "";
      let lastY: number | null = null;
      lines.forEach((line) => {
        if (lastY !== null && Math.abs(line.y - lastY) > 4) output += "\n";
        else if (output) output += " ";
        output += line.str;
        lastY = line.y;
      });

      return output.trim();
    } catch {
      return "";
    }
  }

  async function captureClip(rect: Clip["rect"]) {
    const canvas = canvasRef.current;
    if (!canvas || rect.w <= 12 || rect.h <= 12) return;

    const dpr = canvas.width / canvas.clientWidth;
    const clipCanvas = document.createElement("canvas");
    clipCanvas.width = rect.w * dpr;
    clipCanvas.height = rect.h * dpr;
    const context = clipCanvas.getContext("2d");
    if (!context) return;

    context.drawImage(
      canvas,
      rect.x * dpr,
      rect.y * dpr,
      rect.w * dpr,
      rect.h * dpr,
      0,
      0,
      clipCanvas.width,
      clipCanvas.height
    );

    const extractedText = await extractTextInRect(rect);
    const id = Date.now();
    const newClip: Clip = {
      id,
      pageNo: currentPage,
      dataUrl: clipCanvas.toDataURL("image/png"),
      extractedText,
      rect,
      ratios: {
        x: rect.x / pageSize.width,
        y: rect.y / pageSize.height,
        w: rect.w / pageSize.width,
        h: rect.h / pageSize.height
      },
      messages: [],
      turns: [],
      started: false,
      loading: false
    };

    setClips((prev) => [newClip, ...prev]);
    setInspectorOpen(true);
  }

  async function exchange(
    clipId: number,
    displayText: string,
    userContent: MessagePart[],
    options: { showUserTurn?: boolean } = {}
  ) {
    const target = clips.find((clip) => clip.id === clipId);
    if (!target) return;
    if (disabledProviders.includes(ai.provider)) {
      setError("선택한 AI 프로바이더는 현재 비활성화되어 있습니다. 설정에서 OpenAI 또는 Gemini를 선택하세요.");
      return;
    }

    const showUserTurn = options.showUserTurn ?? true;
    const nextMessages = [...target.messages, { role: "user" as const, content: userContent }];
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId
          ? {
              ...clip,
              started: true,
              loading: true,
              messages: nextMessages,
              turns: showUserTurn ? [...clip.turns, { role: "user", text: displayText }] : clip.turns
            }
          : clip
      )
    );

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({
          provider: ai.provider,
          model: ai.model || undefined,
          messages: nextMessages
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
        finishReason?: string;
        truncated?: boolean;
      };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      const answer = (data.text || "").trim();
      if (!answer) throw new Error("빈 응답");

      setClips((prev) =>
        prev.map((clip) =>
          clip.id === clipId
            ? {
                ...clip,
                loading: false,
                messages: [...nextMessages, { role: "assistant", content: [{ type: "text", text: answer }] }],
                turns: [
                  ...clip.turns,
                  {
                    role: "assistant",
                    text: answer,
                    finishReason: data.finishReason,
                    truncated: data.truncated
                  }
                ]
              }
            : clip
        )
      );
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "요청에 실패했습니다.";
      setClips((prev) =>
        prev.map((clip) =>
          clip.id === clipId
            ? {
                ...clip,
                loading: false,
                messages: clip.messages,
                turns: [...clip.turns, { role: "error", text: `요청 실패: ${message}` }]
              }
            : clip
        )
      );
    }
  }

  function startThread(clip: Clip, question: string, options: { showUserTurn?: boolean } = {}) {
    const content: MessagePart[] = [
      { type: "image", mediaType: "image/png", data: clip.dataUrl.split(",")[1] },
      {
        type: "text",
        text:
          `다음은 PDF ${clip.pageNo}페이지에서 사용자가 선택한 영역입니다. ` +
          (clip.extractedText
            ? `참고용 추출 텍스트:\n"""\n${clip.extractedText.slice(0, 4000)}\n"""\n\n`
            : "텍스트 레이어가 없으니 이미지를 직접 읽어주세요.\n\n") +
          `요청: ${question}\n\n한국어로, 머리말 없이 본문만 마크다운으로 답하세요.`
      }
    ];
    void exchange(clip.id, question, content, options);
  }

  function submitFollowup(clip: Clip, question: string) {
    if (!question.trim()) return;
    if (!clip.started) {
      startThread(clip, question, { showUserTurn: true });
      return;
    }
    void exchange(clip.id, question, [{ type: "text", text: question }]);
  }

  function changeScale(nextScale: number) {
    const canvasArea = canvasAreaRef.current;

    if (canvasArea) {
      pendingScrollRatioRef.current = {
        left:
          canvasArea.scrollWidth > canvasArea.clientWidth
            ? canvasArea.scrollLeft / (canvasArea.scrollWidth - canvasArea.clientWidth)
            : 0,
        top:
          canvasArea.scrollHeight > canvasArea.clientHeight
            ? canvasArea.scrollTop / (canvasArea.scrollHeight - canvasArea.clientHeight)
            : 0
      };
    }

    setScale(nextScale);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!selecting || !overlayRef.current) return;
    event.preventDefault();
    const bounds = overlayRef.current.getBoundingClientRect();
    setDrag({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    });
    overlayRef.current.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag || !overlayRef.current) return;
    const bounds = overlayRef.current.getBoundingClientRect();
    setDrag({
      ...drag,
      cur: {
        x: Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width),
        y: Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height)
      }
    });
  }

  function handlePointerUp() {
    if (!drag?.cur) {
      setDrag(null);
      return;
    }

    const rect = {
      x: Math.min(drag.x, drag.cur.x),
      y: Math.min(drag.y, drag.cur.y),
      w: Math.abs(drag.cur.x - drag.x),
      h: Math.abs(drag.cur.y - drag.y)
    };
    setDrag(null);
    void captureClip(rect);
  }

  const marquee = drag?.cur
    ? {
        left: Math.min(drag.x, drag.cur.x),
        top: Math.min(drag.y, drag.cur.y),
        width: Math.abs(drag.cur.x - drag.x),
        height: Math.abs(drag.cur.y - drag.y)
      }
    : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <span className="dot" />
            Verso <small>document analysis workspace</small>
          </div>
        </div>
        <div className="doc-name">{fileName}</div>
        <div className="spacer" />
        <div className="topbar-actions">
          <Link className="topbar-link" href="/refine">
            <Images size={18} aria-hidden="true" />
            이미지 문서화
          </Link>
          {pdfDoc && (
            <button className="icon-btn" type="button" aria-label="새 문서 분석" title="새 문서 분석" onClick={resetDocument}>
              <FilePlus2 size={19} />
            </button>
          )}
          <button className="icon-btn" type="button" aria-label="설정" title="설정" onClick={openSettings}>
            <Settings size={19} />
          </button>
        </div>
      </header>

      <div
        className={`workspace ${pdfDoc ? "" : "empty"}`}
        ref={workspaceRef}
        style={
          {
            "--thumb-width": `${thumbWidth}px`,
            "--inspector-width": `${inspectorWidth}px`
          } as React.CSSProperties
        }
      >
        {pdfDoc && (
          <aside className="thumbs">
            <h3>페이지</h3>
            <div className="thumb-list">
              {thumbs.map((thumb) => (
                <button
                  key={thumb.page}
                  className={`thumb ${thumb.page === currentPage ? "active" : ""}`}
                  onClick={() => setCurrentPage(thumb.page)}
                >
                  {thumb.url ? (
                    <img src={thumb.url} alt={`${thumb.page} 페이지 미리보기`} />
                  ) : (
                    <span className="thumb-loading" aria-label={`${thumb.page} 페이지 미리보기 생성 중`} />
                  )}
                  <span className="num">{thumb.page}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {pdfDoc && (
          <button
            aria-label="페이지 목록 너비 조절"
            className={`resize-handle left ${resizeTarget === "thumbs" ? "active" : ""}`}
            onPointerDown={(event) => {
              event.preventDefault();
              setResizeTarget("thumbs");
            }}
            type="button"
          />
        )}

        <main className="viewer">
          {!pdfDoc && (
            <div
              className="dropzone"
              onDragEnter={(event) => event.preventDefault()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file?.type === "application/pdf") void loadFile(file);
              }}
            >
              <div className="glyph" />
              <p><b>PDF를 선택해주세요</b></p>
              <p className="dropzone-sub">미리보기, 영역 선택, 요약을 시작합니다.</p>
              <button className="upload-btn" disabled={!pdfJsReady} onClick={() => fileInputRef.current?.click()}>
                {pdfJsReady ? "PDF 열기" : "PDF 엔진 로딩 중"}
              </button>
              {error && <p className="error-text">{error}</p>}
            </div>
          )}

          {pdfDoc && (
            <>
              <div className="toolbar">
                <div className="group">
                  <button className="tbtn" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                    이전
                  </button>
                  <span className="page-indicator">{currentPage} / {totalPages}</span>
                  <button className="tbtn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                    다음
                  </button>
                </div>
                <div className="group">
                  <button className="tbtn" onClick={() => changeScale(Math.max(0.5, scale - 0.2))}>-</button>
                  <span className="page-indicator">{Math.round((scale / 1.2) * 100)}%</span>
                  <button className="tbtn" onClick={() => changeScale(Math.min(3, scale + 0.2))}>+</button>
                </div>
                <div className="group">
                  <button className={`tbtn ${selecting ? "on" : ""}`} onClick={() => setSelecting((value) => !value)}>
                    영역 선택
                  </button>
                </div>
              </div>

              <div className="canvas-area" ref={canvasAreaRef}>
                <div className={`page-wrap ${selecting ? "selecting" : ""}`}>
                  <canvas ref={canvasRef} />
                  <div ref={textLayerRef} className="text-layer" />
                  <div
                    ref={overlayRef}
                    className={`overlay ${selecting ? "armed" : ""}`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {marquee && <div className="marquee" style={marquee} />}
                  </div>
                  {visibleClips.map((clip) => (
                    <button
                      key={clip.id}
                      className={`pin ${activeClipId === clip.id ? "active" : ""}`}
                      style={{
                        left: clip.ratios.x * pageSize.width,
                        top: clip.ratios.y * pageSize.height,
                        width: clip.ratios.w * pageSize.width,
                        height: clip.ratios.h * pageSize.height
                      }}
                      onClick={() => {
                        setActiveClipId(clip.id);
                        setInspectorOpen(true);
                      }}
                      onMouseEnter={() => setActiveClipId(clip.id)}
                      onMouseLeave={() => setActiveClipId(null)}
                    >
                      <span className="tag">{clips.length - clips.findIndex((item) => item.id === clip.id)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>

        {pdfDoc && (
          <button
            aria-label="AI 분석 패널 너비 조절"
            className={`resize-handle right ${resizeTarget === "inspector" ? "active" : ""}`}
            onPointerDown={(event) => {
              event.preventDefault();
              setResizeTarget("inspector");
            }}
            type="button"
          />
        )}

        {pdfDoc && (
          <aside className={`inspector ${inspectorOpen ? "open" : ""}`}>
            <DocSummaryPanel summary={summary} onRun={() => void runSummary()} canRun={!!pdfDoc} />
            <h3>AI 분석</h3>
            <div className="hint">영역 선택을 켜고 페이지에서 분석할 부분을 드래그하세요. 잘라낸 영역이 여기에 쌓입니다.</div>
            <div className="clip-list">
              {clips.length === 0 && <div className="empty-clips">아직 선택한 영역이 없어요</div>}
              {clips.map((clip, index) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  number={clips.length - index}
                  active={activeClipId === clip.id}
                  onFocus={() => {
                    setCurrentPage(clip.pageNo);
                    setActiveClipId(clip.id);
                  }}
                  onHover={(active) => setActiveClipId(active ? clip.id : null)}
                  onDelete={() => setClips((prev) => prev.filter((item) => item.id !== clip.id))}
                  onAnalyze={() =>
                    startThread(clip, DEFAULT_ANALYSIS_PROMPT, { showUserTurn: false })
                  }
                  onAsk={(question) => submitFollowup(clip, question)}
                />
              ))}
            </div>
          </aside>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
          event.currentTarget.value = "";
        }}
      />

      {pdfDoc && (
        <button className="clip-fab" onClick={() => setInspectorOpen((value) => !value)}>
          분석 패널 <span className="cnt">{clips.length}</span>
        </button>
      )}

      {settingsOpen && (
        <SettingsModal
          draftAi={draftAi}
          setDraftAi={setDraftAi}
          serverKeyProviders={serverKeyProviders}
          disabledProviders={disabledProviders}
          onClose={closeSettings}
          onSave={saveSettings}
          hasPdf={!!pdfDoc}
          hasFileBytes={!!fileBytes}
          clipCount={clips.length}
          onDownloadOriginal={downloadOriginal}
          onDownloadDocx={downloadAnalysisDocx}
          onDownloadHtml={downloadAnalysisHtml}
        />
      )}
    </div>
  );
}
