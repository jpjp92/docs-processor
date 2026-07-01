import { useState } from "react";

import type { AiSettings, PdfDocument, Provider, SummaryState } from "@/lib/pdf-workspace/types";
import { parseSummary } from "@/lib/summarize";

const EMPTY_SUMMARY: SummaryState = { done: false, error: "", loading: false, overview: "", sections: [] };

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

/** 문서 전체 본문을 모아 스트리밍 요약을 받고 상태로 점진 반영한다. */
export function useSummary({
  pdfDoc,
  ai,
  disabledProviders
}: {
  pdfDoc: PdfDocument | null;
  ai: AiSettings;
  disabledProviders: Provider[];
}) {
  const [summary, setSummary] = useState<SummaryState>(EMPTY_SUMMARY);

  const resetSummary = () => setSummary(EMPTY_SUMMARY);

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
      // 요약은 서버에서 Gemini Flash를 기본으로 쓴다. 비활성 프로바이더면 provider를 비워 서버 기본값에 맡긴다.
      const provider = disabledProviders.includes(ai.provider) ? undefined : ai.provider;

      const response = await fetch("/api/summarize", {
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

  return { summary, runSummary, resetSummary };
}
