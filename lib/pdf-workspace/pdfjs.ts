import { PDFJS_URL, PDFJS_WORKER_URL } from "@/lib/pdf-workspace/constants";
import type { PdfJsLib } from "@/lib/pdf-workspace/types";

export function loadPdfJs(): Promise<PdfJsLib> {
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
