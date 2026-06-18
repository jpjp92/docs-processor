"use client";

import {
  Braces,
  FileCode2,
  FileDown,
  FilePlus2,
  Loader2,
  SendHorizontal,
  Settings,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { parseSummary, type SummarySection } from "@/lib/summarize";

type Provider = "claude" | "openai" | "gemini";

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image"; mediaType: string; data: string };
type MessagePart = TextPart | ImagePart;
type Message = { role: "user" | "assistant"; content: MessagePart[] };

type Clip = {
  id: number;
  pageNo: number;
  dataUrl: string;
  extractedText: string;
  rect: { x: number; y: number; w: number; h: number };
  ratios: { x: number; y: number; w: number; h: number };
  messages: Message[];
  turns: {
    role: "user" | "assistant" | "error";
    text: string;
    finishReason?: string;
    truncated?: boolean;
  }[];
  started: boolean;
  loading: boolean;
};

type PdfPage = {
  getViewport(input: { scale: number }): { width: number; height: number; transform: number[] };
  render(input: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    transform?: number[];
  }): { promise: Promise<void> };
  getTextContent(): Promise<{ items: Array<{ str?: string; width: number; height: number; transform: number[] }> }>;
};

type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
};

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(input: { data: ArrayBuffer }): { promise: Promise<PdfDocument> };
  Util: { transform(a: number[], b: number[]): number[] };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const PROVIDER_INFO: Record<Provider, { label: string; keyName: string; model: string; url: string }> = {
  claude: {
    label: "Claude (Anthropic)",
    keyName: "Anthropic API 키",
    model: "claude-sonnet-4-6",
    url: "console.anthropic.com"
  },
  openai: {
    label: "GPT (OpenAI)",
    keyName: "OpenAI API 키",
    model: "gpt-5-mini",
    url: "platform.openai.com"
  },
  gemini: {
    label: "Gemini (Google)",
    keyName: "Google AI Studio 키",
    model: "gemini-2.5-flash",
    url: "aistudio.google.com"
  }
};

const FALLBACK_PROVIDER: Provider = "openai";
const LOCAL_DISABLED_PROVIDERS: Provider[] = ["claude"];

const PRESETS = [
  "아래 형식으로 짧게 요약해줘.\n\n## 한줄 요약\n> 핵심 결론 1문장\n\n## 핵심 포인트\n- 포인트 1\n- 포인트 2\n- 포인트 3\n\n## 숫자/차트 의미\n- 중요한 수치나 비교가 있으면 2개 이내로 설명\n\n각 항목은 간결하게 작성해줘.",
  "이 영역의 내용을 한국어로 번역해줘. 원문 구조를 유지하고, 표나 항목은 마크다운 목록으로 정리해줘.",
  "표나 데이터가 있으면 마크다운 표로 정리해줘. 표 아래에는 '읽는 법' 섹션을 만들고 핵심 해석을 불릿 3개 이내로 덧붙여줘.",
  "핵심을 아래 형식으로 불릿 3개로 정리해줘.\n\n## 핵심 3가지\n- **무엇:**\n- **왜 중요:**\n- **봐야 할 숫자:**"
];

const PRESET_LABELS = ["요약", "번역", "표 정리", "핵심 3가지"];

const DEFAULT_ANALYSIS_PROMPT = `이 영역의 내용을 한국어로 분석해줘.

반드시 아래 형식으로 답해줘.

## 한줄 요약
> 이 영역이 말하는 핵심을 1문장으로 작성

## 핵심 포인트
- 가장 중요한 내용
- 근거가 되는 수치/대상/비교
- 사용자가 기억해야 할 의미

## 세부 의미
- 표/차트/수식이 있으면 무엇을 비교하는지 설명
- 눈에 띄는 숫자는 2~4개만 골라 의미를 설명

## 다음에 볼 것
- 이어서 확인하면 좋은 질문 1개

규칙:
- 장문 문단보다 짧은 문장과 불릿을 우선해줘.
- 보이지 않는 내용은 추측하지 말고 '이미지에서 확인되지 않음'이라고 써줘.
- 마크다운만 사용하고 머리말은 쓰지 마.`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(source: string) {
  const inline = (value: string) =>
    escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const lines = source.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/\|/.test(line) && /^\s*\|?[-: |]+\|?\s*$/.test(lines[i + 1] || "")) {
      const head = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /\|/.test(lines[i])) {
        rows.push(lines[i].split("|").map((cell) => cell.trim()).filter(Boolean));
        i += 1;
      }
      html += `<table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>`;
      html += `<tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      const level = heading[1].length + 2;
      html += `<h${level}>${inline(heading[2])}</h${level}>`;
      i += 1;
      continue;
    }

    if (/^\s*>\s+/.test(line)) {
      html += "<blockquote>";
      while (i < lines.length && /^\s*>\s+/.test(lines[i])) {
        html += `<p>${inline(lines[i].replace(/^\s*>\s+/, ""))}</p>`;
        i += 1;
      }
      html += "</blockquote>";
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      html += "<hr />";
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      html += "<ul>";
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`;
        i += 1;
      }
      html += "</ul>";
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      html += "<ol>";
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`;
        i += 1;
      }
      html += "</ol>";
      continue;
    }

    if (line.trim()) {
      html += `<p>${inline(line)}</p>`;
    }
    i += 1;
  }

  return html;
}

function downloadTextFile(fileName: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function safeFileStem(value: string) {
  return (value || "analysis")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w가-힣.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "analysis";
}

function loadPdfJs(): Promise<PdfJsLib> {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return Promise.resolve(window.pdfjsLib);
  }

  return new Promise<PdfJsLib>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PDFJS_URL}"]`);
    const script = existing || document.createElement("script");
    script.src = PDFJS_URL;
    script.async = true;
    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error("pdf.js를 불러오지 못했습니다."));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("pdf.js 스크립트 로딩에 실패했습니다."));
    if (!existing) document.head.appendChild(script);
  });
}

export default function PdfWorkspace() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const pendingScrollRatioRef = useRef<{ left: number; top: number } | null>(null);

  const [pdfJsReady, setPdfJsReady] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [fileName, setFileName] = useState("");
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [thumbs, setThumbs] = useState<Array<{ page: number; url: string }>>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [activeClipId, setActiveClipId] = useState<number | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [serverKeyProviders, setServerKeyProviders] = useState<Provider[]>([]);
  const [disabledProviders, setDisabledProviders] = useState<Provider[]>(LOCAL_DISABLED_PROVIDERS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ai, setAi] = useState({ backend: "", provider: FALLBACK_PROVIDER, model: "", key: "" });
  const [draftAi, setDraftAi] = useState(ai);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [currentPageProxy, setCurrentPageProxy] = useState<PdfPage | null>(null);
  const [currentViewport, setCurrentViewport] = useState<{ transform: number[] } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; cur?: { x: number; y: number } } | null>(null);
  const [thumbWidth, setThumbWidth] = useState(168);
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const [resizeTarget, setResizeTarget] = useState<"thumbs" | "inspector" | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{
    loading: boolean;
    overview: string;
    sections: SummarySection[];
    error: string;
    done: boolean;
  }>({ done: false, error: "", loading: false, overview: "", sections: [] });

  const totalPages = pdfDoc?.numPages || 0;
  const currentProviderInfo = PROVIDER_INFO[draftAi.provider];
  const currentProviderDisabled = disabledProviders.includes(draftAi.provider);
  const providerHasServerKey = serverKeyProviders.includes(draftAi.provider);

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
    setThumbs([]);
    setSummary({ done: false, error: "", loading: false, overview: "", sections: [] });
    await buildThumbs(doc);
  }

  async function buildThumbs(doc: PdfDocument) {
    const result: Array<{ page: number; url: string }> = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) continue;
      await page.render({ canvasContext: context, viewport }).promise;
      result.push({ page: pageNumber, url: canvas.toDataURL("image/png") });
    }
    setThumbs(result);
  }

  async function collectAllText(doc: PdfDocument): Promise<string> {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => item.str || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) pages.push(text);
    }
    return pages.join("\n\n");
  }

  async function runSummary() {
    if (!pdfDoc) return;
    setSummary({ done: false, error: "", loading: true, overview: "", sections: [] });
    try {
      const text = await collectAllText(pdfDoc);
      if (!text.trim()) {
        setSummary((prev) => ({
          ...prev,
          loading: false,
          error: "본문 텍스트를 추출할 수 없습니다. 스캔 이미지 PDF일 수 있어요."
        }));
        return;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (ai.key) headers["x-provider-key"] = ai.key;
      // 요약은 서버에서 Gemini Flash를 기본으로 쓴다. 비활성 프로바이더면 provider를 비워 서버 기본값에 맡긴다.
      const provider = disabledProviders.includes(ai.provider) ? undefined : ai.provider;

      const response = await fetch(`${ai.backend}/api/summarize`, {
        body: JSON.stringify({ model: provider ? ai.model || undefined : undefined, provider, text }),
        headers,
        method: "POST"
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        const parsed = parseSummary(raw);
        setSummary((prev) => ({ ...prev, overview: parsed.overview, sections: parsed.sections }));
      }

      const finalParsed = parseSummary(raw);
      setSummary((prev) => ({
        ...prev,
        done: true,
        loading: false,
        overview: finalParsed.overview,
        sections: finalParsed.sections
      }));
    } catch (summaryError) {
      setSummary((prev) => ({
        ...prev,
        loading: false,
        error: summaryError instanceof Error ? summaryError.message : "요약에 실패했습니다."
      }));
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
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setPdfDoc(null);
    setCurrentPage(1);
    setScale(1.2);
    setFileName("");
    setFileBytes(null);
    setFileUrl("");
    setThumbs([]);
    setClips([]);
    setSummary({ done: false, error: "", loading: false, overview: "", sections: [] });
    setSelecting(false);
    setActiveClipId(null);
    setInspectorOpen(false);
    setCurrentPageProxy(null);
    setCurrentViewport(null);
    setPageSize({ width: 0, height: 0 });
    setDrag(null);
    setSettingsOpen(false);
    pendingScrollRatioRef.current = null;
    if (canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      context?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (textLayerRef.current) textLayerRef.current.innerHTML = "";
  }

  function buildAnalysisExport() {
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

  function downloadAnalysisJson() {
    const payload = buildAnalysisExport();
    downloadTextFile(
      `${safeFileStem(fileName)}-analysis.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }

  function downloadAnalysisHtml() {
    const payload = buildAnalysisExport();
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

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fileName || "Analysis Report")}</title>
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
      <h1>${escapeHtml(fileName || "Untitled document")}</h1>
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

  async function openSettings() {
    let nextDisabledProviders = disabledProviders;
    try {
      const response = await fetch(`${ai.backend}/api/config`);
      if (response.ok) {
        const config = (await response.json()) as {
          disabledProviders?: Provider[];
          providersWithServerKey?: Provider[];
        };
        setServerKeyProviders(config.providersWithServerKey || []);
        nextDisabledProviders = config.disabledProviders || LOCAL_DISABLED_PROVIDERS;
        setDisabledProviders(nextDisabledProviders);
      }
    } catch {
      setServerKeyProviders([]);
      nextDisabledProviders = LOCAL_DISABLED_PROVIDERS;
      setDisabledProviders(nextDisabledProviders);
    }
    setDraftAi(nextDisabledProviders.includes(ai.provider) ? { ...ai, provider: FALLBACK_PROVIDER, key: "" } : ai);
    setSettingsOpen(true);
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
      if (ai.key) headers["x-provider-key"] = ai.key;

      const response = await fetch(`${ai.backend}/api/analyze`, {
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
            Verso <small>read, mark, understand</small>
          </div>
        </div>
        <div className="doc-name">{fileName}</div>
        <div className="spacer" />
        <div className="topbar-actions">
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
                  <img src={thumb.url} alt={`${thumb.page} 페이지 미리보기`} />
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
              <p><b>PDF를 끌어다 놓거나</b> 파일을 선택하세요</p>
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
            <div className="doc-summary">
              <div className="doc-summary-head">
                <h3>문서 전체 요약</h3>
                <button
                  type="button"
                  className="summary-run"
                  onClick={() => void runSummary()}
                  disabled={summary.loading || !pdfDoc}
                >
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
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <div className="modal">
            <div className="modal-head">
              <h2>설정</h2>
              <button className="x" aria-label="설정 닫기" onClick={() => setSettingsOpen(false)}>
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
                    <option
                      disabled={disabledProviders.includes(provider as Provider)}
                      key={provider}
                      value={provider}
                    >
                      {info.label}{disabledProviders.includes(provider as Provider) ? " (비활성)" : ""}
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

              <label className="field">
                <span>백엔드 주소 <em>(비워두면 같은 서버)</em></span>
                <input
                  value={draftAi.backend}
                  onChange={(event) => setDraftAi((prev) => ({ ...prev, backend: event.target.value }))}
                  placeholder="https://api.myserver.com"
                />
              </label>
              </section>

              <section className="settings-section">
                <h3>문서</h3>
                <div className="action-grid">
                  <button className="action-btn" disabled={!pdfDoc || !fileBytes} onClick={downloadOriginal}>
                    <FileDown size={18} />
                    <span>원본 PDF</span>
                  </button>
                </div>
              </section>

              <section className="settings-section">
                <h3>분석 내보내기</h3>
                <div className="action-grid">
                  <button className="action-btn" disabled={!pdfDoc || clips.length === 0} onClick={downloadAnalysisJson}>
                    <Braces size={18} />
                    <span>JSON</span>
                  </button>
                  <button className="action-btn" disabled={!pdfDoc || clips.length === 0} onClick={downloadAnalysisHtml}>
                    <FileCode2 size={18} />
                    <span>HTML 리포트</span>
                  </button>
                </div>
                <p className="note">HTML 리포트는 브라우저에서 바로 열어 읽기 좋고, JSON은 재가공이나 백업에 적합합니다.</p>
              </section>
            </div>
            <div className="modal-foot">
              <button className="ghost" onClick={() => setSettingsOpen(false)}>취소</button>
              <button
                className="primary"
                disabled={currentProviderDisabled}
                onClick={() => {
                  setAi({
                    ...draftAi,
                    backend: draftAi.backend.trim().replace(/\/$/, ""),
                    key: providerHasServerKey ? "" : draftAi.key.trim(),
                    model: draftAi.model.trim()
                  });
                  setSettingsOpen(false);
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClipCard({
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
