import type { Provider } from "@/lib/pdf-workspace/types";

export const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
export const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

export const PROVIDER_INFO: Record<Provider, { label: string; keyName: string; model: string; url: string }> = {
  claude: {
    label: "Claude (Anthropic)",
    keyName: "Anthropic API 키",
    model: "claude-sonnet-4-6",
    url: "console.anthropic.com"
  },
  openai: {
    label: "GPT (OpenAI)",
    keyName: "OpenAI API 키",
    model: "gpt-5.4-mini",
    url: "platform.openai.com"
  },
  gemini: {
    label: "Gemini (Google)",
    keyName: "Google AI Studio 키",
    model: "gemini-3.5-flash",
    url: "aistudio.google.com"
  }
};

export const FALLBACK_PROVIDER: Provider = "openai";
export const LOCAL_DISABLED_PROVIDERS: Provider[] = ["claude"];

export const PRESETS = [
  "아래 형식으로 짧게 요약해줘.\n\n## 한줄 요약\n> 핵심 결론 1문장\n\n## 핵심 포인트\n- 포인트 1\n- 포인트 2\n- 포인트 3\n\n## 숫자/차트 의미\n- 중요한 수치나 비교가 있으면 2개 이내로 설명\n\n각 항목은 간결하게 작성해줘.",
  "이 영역의 내용을 한국어로 번역해줘. 원문 구조를 유지하고, 표나 항목은 마크다운 목록으로 정리해줘.",
  "표나 데이터가 있으면 마크다운 표로 정리해줘. 표 아래에는 '읽는 법' 섹션을 만들고 핵심 해석을 불릿 3개 이내로 덧붙여줘.",
  "핵심을 아래 형식으로 불릿 3개로 정리해줘.\n\n## 핵심 3가지\n- **무엇:**\n- **왜 중요:**\n- **봐야 할 숫자:**"
];

export const PRESET_LABELS = ["요약", "번역", "표 정리", "핵심 3가지"];

export const DEFAULT_ANALYSIS_PROMPT = `이 영역의 내용을 한국어로 분석해줘.

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
