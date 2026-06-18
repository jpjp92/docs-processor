import type { StandardMessage } from "@/lib/providers";

export const MAX_SECTIONS = 10;
const MAX_LINE_CHARS = 90;
const MAX_TITLE_CHARS = 30;

// 단일 호출(Phase 1)이 안전하게 들어가는 입력 길이 상한.
// 이 길이를 넘으면 Phase 2(병렬 Map-Reduce)로 분기해야 한다.
export const MAX_INPUT_CHARS = 600_000;

export type SummarySection = {
  title: string;
  point: string;
};

export type DocumentSummary = {
  overview: string;
  sections: SummarySection[];
};

const OVERVIEW_PREFIX = "OVERVIEW:";
const SECTION_PREFIX = "SECTION:";
const SECTION_SEP = "||";

export const SUMMARY_INSTRUCTION = [
  "너는 문서를 빠르게 훑어볼 수 있게 요약하는 도우미다.",
  "아래 본문을 읽고 한국어로 구조화된 요약을 만든다.",
  "",
  "반드시 다음 형식으로만 출력한다. 다른 말은 절대 덧붙이지 않는다.",
  `${OVERVIEW_PREFIX} <문서 전체를 한 문장으로>`,
  `${SECTION_PREFIX} <섹션명> ${SECTION_SEP} <그 섹션 핵심을 한 문장으로>`,
  `${SECTION_PREFIX} <섹션명> ${SECTION_SEP} <그 섹션 핵심을 한 문장으로>`,
  "",
  "규칙:",
  `- OVERVIEW는 정확히 1줄.`,
  `- SECTION은 최대 ${MAX_SECTIONS}개. 그 이상이면 의미를 묶어서 압축한다.`,
  "- 본문의 논리적 흐름(서론/배경/쟁점/사례/결론 등)을 섹션으로 추론한다.",
  "- 모든 줄은 한 줄을 넘기지 않는다. 줄바꿈, 마크다운, 글머리표를 쓰지 않는다.",
  `- 각 줄은 ${MAX_LINE_CHARS}자 이내로 간결하게.`
].join("\n");

export function buildSummaryMessages(text: string): StandardMessage[] {
  return [
    {
      role: "user",
      content: [{ type: "text", text: `${SUMMARY_INSTRUCTION}\n\n---- 본문 시작 ----\n${text}\n---- 본문 끝 ----` }]
    }
  ];
}

function oneLine(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * 모델이 스트리밍으로 흘려보낸(또는 완성된) 라인 기반 텍스트를 구조화한다.
 * 부분 텍스트로 호출돼도 안전하도록 만들어, 스트리밍 중 점진 렌더에 그대로 쓴다.
 * 한 줄/섹션 10개 제한은 프롬프트를 믿지 않고 여기서 강제한다.
 */
export function parseSummary(raw: string): DocumentSummary {
  const lines = raw.split(/\r?\n/);
  let overview = "";
  const sections: SummarySection[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toUpperCase().startsWith(OVERVIEW_PREFIX)) {
      overview = oneLine(trimmed.slice(OVERVIEW_PREFIX.length), MAX_LINE_CHARS);
      continue;
    }

    if (trimmed.toUpperCase().startsWith(SECTION_PREFIX)) {
      if (sections.length >= MAX_SECTIONS) continue;
      const rest = trimmed.slice(SECTION_PREFIX.length).trim();
      const sepIndex = rest.indexOf(SECTION_SEP);
      const title = sepIndex >= 0 ? rest.slice(0, sepIndex) : rest;
      const point = sepIndex >= 0 ? rest.slice(sepIndex + SECTION_SEP.length) : "";
      const cleanTitle = oneLine(title, MAX_TITLE_CHARS);
      const cleanPoint = oneLine(point, MAX_LINE_CHARS);
      if (!cleanTitle && !cleanPoint) continue;
      sections.push({ point: cleanPoint, title: cleanTitle });
    }
  }

  return { overview, sections };
}
