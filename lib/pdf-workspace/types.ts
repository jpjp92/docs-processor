import type { SummarySection } from "@/lib/summarize";

export type Provider = "claude" | "openai" | "gemini";

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image"; mediaType: string; data: string };
export type MessagePart = TextPart | ImagePart;
export type Message = { role: "user" | "assistant"; content: MessagePart[] };

export type Clip = {
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

export type PdfPage = {
  getViewport(input: { scale: number }): { width: number; height: number; transform: number[] };
  render(input: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    transform?: number[];
  }): { promise: Promise<void> };
  getTextContent(): Promise<{ items: Array<{ str?: string; width: number; height: number; transform: number[] }> }>;
};

export type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
};

export type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(input: { data: ArrayBuffer }): { promise: Promise<PdfDocument> };
  Util: { transform(a: number[], b: number[]): number[] };
};

/** 설정 모달이 다루는 AI 설정. */
export type AiSettings = { provider: Provider; model: string };

/** 문서 전체 요약 패널의 상태. */
export type SummaryState = {
  loading: boolean;
  overview: string;
  sections: SummarySection[];
  error: string;
  done: boolean;
};

/** `buildAnalysisExport()`가 만드는 내보내기 페이로드 형태. */
export type AnalysisExport = {
  document: { fileName: string | null; totalPages: number; exportedAt: string };
  ai: { provider: Provider; model: string };
  summary: { overview: string; sections: SummarySection[] } | null;
  clips: Array<{
    id: number;
    pageNo: number;
    extractedText: string;
    image: string;
    turns: Clip["turns"];
  }>;
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}
