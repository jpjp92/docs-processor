import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

import { PROVIDER_INFO } from "@/lib/pdf-workspace/constants";
import type { AnalysisExport } from "@/lib/pdf-workspace/types";

const FONT = { ascii: "Calibri", eastAsia: "Malgun Gothic", hAnsi: "Calibri" };
const CODE_FONT = "Consolas";
const COLOR = {
  accent: "3F46D8",
  border: "D8DCE4",
  heading: "15181F",
  muted: "737985",
  paper: "F7F7F4",
  text: "15181F"
};

type DocBlock = Paragraph | Table;

function normalizeInlineHtml(text: string) {
  return (text || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr)\s*>/gi, "\n")
    .replace(/<\s*\/?\s*(strong|b)\s*>/gi, "**")
    .replace(/<\s*\/?\s*(em|i)\s*>/gi, "*")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseInline(text: string, base: Record<string, unknown> = {}) {
  const runs: TextRun[] = [];
  const matcher = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(~~([^~]+)~~)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const push = (value: string, opts: Record<string, unknown> = {}) => {
    if (!value) return;
    value.split("\n").forEach((part, index) => {
      if (index > 0) runs.push(new TextRun({ break: 1 }));
      if (part) runs.push(new TextRun({ font: FONT, size: 21, text: part, ...base, ...opts }));
    });
  };

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > last) push(text.slice(last, match.index));
    if (match[2] !== undefined) push(match[2], { bold: true });
    else if (match[4] !== undefined) push(match[4], { bold: true });
    else if (match[6] !== undefined) push(match[6], { italics: true });
    else if (match[8] !== undefined) push(match[8], { italics: true });
    else if (match[10] !== undefined) {
      push(match[10], {
        color: "B4256B",
        font: CODE_FONT,
        shading: { color: "F1F1F4", fill: "F1F1F4", type: ShadingType.SOLID }
      });
    } else if (match[12] !== undefined) push(match[12], { strike: true });
    last = matcher.lastIndex;
  }

  if (last < text.length) push(text.slice(last));
  if (runs.length === 0) push(text || " ");
  return runs;
}

function paragraph(text: string, options: { bold?: boolean; color?: string; size?: number } = {}) {
  return new Paragraph({
    children: parseInline(normalizeInlineHtml(text || " "), {
      bold: options.bold,
      color: options.color || COLOR.text,
      size: options.size || 21
    }),
    spacing: { after: 130, line: 300 }
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({
    children: [new TextRun({ bold: true, color: COLOR.heading, font: FONT, size: level === HeadingLevel.HEADING_1 ? 32 : 25, text })],
    heading: level,
    spacing: { after: 120, before: level === HeadingLevel.HEADING_1 ? 0 : 260 }
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    children: parseInline(normalizeInlineHtml(text), { color: COLOR.text, size: 21 }),
    spacing: { after: 75, line: 290 }
  });
}

function sectionLabel(text: string, color = COLOR.accent) {
  return new Paragraph({
    children: [new TextRun({ bold: true, color, font: FONT, size: 19, text })],
    keepNext: true,
    spacing: { after: 65, before: 160 }
  });
}

function markdownHeading(text: string, level: number) {
  return new Paragraph({
    children: parseInline(normalizeInlineHtml(text), { bold: true, color: level <= 2 ? COLOR.heading : "344054", size: level <= 2 ? 24 : 21 }),
    keepNext: true,
    spacing: { after: 80, before: 180 }
  });
}

function makeMarkdownTable(rows: string[][]) {
  const border = { color: COLOR.border, size: 4, style: BorderStyle.SINGLE };
  const borders = { bottom: border, left: border, right: border, top: border };

  return new Table({
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                borders,
                children: [
                  new Paragraph({
                    children: parseInline(normalizeInlineHtml(cell), rowIndex === 0 ? { bold: true, color: COLOR.heading } : {}),
                    spacing: { after: 0, line: 270 }
                  })
                ],
                margins: { bottom: 95, left: 125, right: 125, top: 95 },
                shading: rowIndex === 0 ? { color: COLOR.paper, fill: COLOR.paper, type: ShadingType.SOLID } : undefined
              })
          ),
          tableHeader: rowIndex === 0
        })
    ),
    width: { size: 100, type: WidthType.PERCENTAGE }
  });
}

function markdownToBlocks(markdown: string): DocBlock[] {
  const lines = normalizeInlineHtml(markdown).replace(/\r\n/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      code.forEach((codeLine) =>
        blocks.push(
          new Paragraph({
            children: [new TextRun({ color: "30323C", font: CODE_FONT, size: 19, text: codeLine || " " })],
            indent: { left: 120 },
            shading: { color: "F6F6F9", fill: "F6F6F9", type: ShadingType.SOLID },
            spacing: { after: 0, line: 252 }
          })
        )
      );
      blocks.push(new Paragraph({ children: [], spacing: { after: 110 } }));
      continue;
    }

    if (/\|/.test(line) && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1])) {
      const tableLines = [line];
      index += 2;
      while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(
        makeMarkdownTable(tableLines.map((tableLine) => tableLine.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|")))
      );
      blocks.push(new Paragraph({ children: [], spacing: { after: 125 } }));
      continue;
    }

    const mdHeading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (mdHeading) {
      blocks.push(markdownHeading(mdHeading[2], mdHeading[1].length));
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      blocks.push(
        new Paragraph({
          border: { left: { color: "C9C5F0", size: 18, space: 14, style: BorderStyle.SINGLE } },
          children: parseInline(trimmed.replace(/^>\s?/, ""), { color: "55576A", italics: true }),
          indent: { left: 260 },
          spacing: { after: 95, line: 288 }
        })
      );
      index += 1;
      continue;
    }

    const indent = /^(\s*)/.exec(line)?.[1].length || 0;
    const unordered = /^[-*+]\s+(.*)$/.exec(line.replace(/^\s+/, ""));
    if (unordered) {
      blocks.push(
        new Paragraph({
          bullet: { level: Math.min(Math.floor(indent / 2), 3) },
          children: parseInline(unordered[1]),
          spacing: { after: 65, line: 288 }
        })
      );
      index += 1;
      continue;
    }

    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(line.replace(/^\s+/, ""));
    if (ordered) {
      blocks.push(
        new Paragraph({
          children: parseInline(ordered[2]),
          numbering: { level: Math.min(Math.floor(indent / 2), 3), reference: "pdf-report-ol" },
          spacing: { after: 65, line: 288 }
        })
      );
      index += 1;
      continue;
    }

    blocks.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: parseInline(trimmed),
        spacing: { after: 125, line: 300 }
      })
    );
    index += 1;
  }

  return blocks.length ? blocks : [paragraph("내용이 없습니다.", { color: COLOR.muted })];
}

function metaTable(payload: AnalysisExport) {
  const rows = [
    ["문서", payload.document.fileName || "Untitled document"],
    ["분석 모델", `${PROVIDER_INFO[payload.ai.provider].label} / ${payload.ai.model}`],
    ["선택 영역", `${payload.clips.length}개`],
    ["내보낸 시각", new Date(payload.document.exportedAt).toLocaleString()]
  ];
  const border = { color: COLOR.border, size: 4, style: BorderStyle.SINGLE };
  return new Table({
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              borders: { bottom: border, left: border, right: border, top: border },
              children: [paragraph(label, { bold: true, color: COLOR.heading, size: 19 })],
              shading: { color: COLOR.paper, fill: COLOR.paper, type: ShadingType.SOLID },
              width: { size: 24, type: WidthType.PERCENTAGE }
            }),
            new TableCell({
              borders: { bottom: border, left: border, right: border, top: border },
              children: [paragraph(value, { size: 19 })],
              width: { size: 76, type: WidthType.PERCENTAGE }
            })
          ]
        })
    ),
    width: { size: 100, type: WidthType.PERCENTAGE }
  });
}

export function buildAnalysisDocx(payload: AnalysisExport) {
  const children: DocBlock[] = [
    heading("PDF 분석 리포트", HeadingLevel.HEADING_1),
    metaTable(payload)
  ];

  if (payload.summary) {
    children.push(heading("문서 전체 요약", HeadingLevel.HEADING_2));
    if (payload.summary.overview) children.push(paragraph(payload.summary.overview, { bold: true, size: 23 }));
    payload.summary.sections.forEach((section) => {
      children.push(bullet(`${section.title}: ${section.point}`));
    });
  }

  children.push(heading("선택 영역 분석", HeadingLevel.HEADING_2));
  if (payload.clips.length === 0) {
    children.push(paragraph("내보낼 선택 영역 분석 결과가 없습니다.", { color: COLOR.muted }));
  }

  payload.clips.forEach((clip) => {
    children.push(heading(`선택 영역 ${clip.id} / ${clip.pageNo}페이지`, HeadingLevel.HEADING_3));
    if (clip.extractedText) {
      children.push(sectionLabel("추출 텍스트"));
      children.push(paragraph(clip.extractedText));
    }
    if (clip.turns.length === 0) {
      children.push(paragraph("아직 분석 대화가 없습니다.", { color: COLOR.muted }));
    }
    clip.turns.forEach((turn) => {
      const label = turn.role === "user" ? "질문" : turn.role === "assistant" ? "답변" : "상태";
      children.push(sectionLabel(label, turn.role === "error" ? "B42318" : COLOR.accent));
      if (turn.truncated) {
        children.push(paragraph(`응답이 출력 한도에서 잘렸을 수 있습니다${turn.finishReason ? ` (${turn.finishReason})` : ""}.`, { color: "9A3412", size: 19 }));
      }
      if (turn.role === "assistant") {
        children.push(...markdownToBlocks(turn.text));
      } else {
        children.push(paragraph(turn.text));
      }
    });
  });

  return new Document({
    numbering: {
      config: [
        {
          levels: [0, 1, 2, 3].map((level) => ({
            alignment: AlignmentType.START,
            format: LevelFormat.DECIMAL,
            level,
            style: { paragraph: { indent: { hanging: 260, left: 360 * (level + 1) } } },
            text: `%${level + 1}.`
          })),
          reference: "pdf-report-ol"
        }
      ]
    },
    sections: [{ children, properties: { page: { margin: { bottom: 1250, left: 1350, right: 1350, top: 1250 } } } }],
    styles: {
      default: {
        document: { run: { color: COLOR.text, font: FONT, size: 21 }, paragraph: { spacing: { after: 130, line: 300 } } },
        heading1: { paragraph: { spacing: { after: 180 } }, run: { bold: true, color: COLOR.heading, font: FONT, size: 32 } },
        heading2: { paragraph: { spacing: { after: 110, before: 260 } }, run: { bold: true, color: COLOR.heading, font: FONT, size: 26 } },
        heading3: { paragraph: { spacing: { after: 85, before: 210 } }, run: { bold: true, color: "344054", font: FONT, size: 23 } }
      }
    }
  });
}

export async function analysisToDocxBlob(payload: AnalysisExport) {
  return Packer.toBlob(buildAnalysisDocx(payload));
}
