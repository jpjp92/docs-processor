import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";

const FONT = { ascii: "Calibri", eastAsia: "Malgun Gothic", hAnsi: "Calibri" };
const CODE_FONT = "Consolas";
const COLOR = {
  accent: "0F8576",
  border: "D7E2DE",
  heading: "172033",
  muted: "667085",
  paper: "F4F8F6",
  text: "202735"
};

function parseInline(text: string, base: Record<string, unknown> = {}) {
  const runs: TextRun[] = [];
  const matcher = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(~~([^~]+)~~)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const push = (value: string, opts: Record<string, unknown> = {}) => {
    if (!value) return;
    runs.push(new TextRun({ text: value, ...base, ...opts }));
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
  if (runs.length === 0) push(text);
  return runs;
}

function makeHeading(text: string, level: number) {
  const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6
  };
  return new Paragraph({
    border: level === 1 ? { bottom: { color: COLOR.border, size: 6, style: BorderStyle.SINGLE } } : undefined,
    children: parseInline(text),
    heading: headingMap[level] || HeadingLevel.HEADING_6,
    keepNext: true,
    spacing: {
      after: level === 1 ? 180 : 90,
      before: level === 1 ? 340 : 220
    }
  });
}

function makeTable(rows: string[][]) {
  const border = { color: COLOR.border, size: 4, style: BorderStyle.SINGLE };
  const borders = { bottom: border, left: border, right: border, top: border };
  const tableRows = rows.map(
    (cells, rowIndex) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              borders,
              children: [
                new Paragraph({
                  children: parseInline(cell.trim(), rowIndex === 0 ? { bold: true, color: COLOR.heading } : {}),
                  spacing: { after: 0, line: 260 }
                })
              ],
              margins: { bottom: 95, left: 130, right: 130, top: 95 },
              shading:
                rowIndex === 0
                  ? { color: COLOR.paper, fill: COLOR.paper, type: ShadingType.SOLID }
                  : undefined,
              verticalAlign: VerticalAlign.CENTER
            })
        ),
        tableHeader: rowIndex === 0
      })
  );

  return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function normalizeMarkdown(markdown: string, title?: string) {
  const lines = (markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/^@@NOTES\b.*$/gim, "")
    .replace(/^@@DOCUMENT\b.*$/gim, "")
    .split("\n");

  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex >= 0 && title) {
    const first = lines[firstContentIndex].trim().replace(/^#\s+/, "").trim();
    if (lines[firstContentIndex].trim().startsWith("# ") && first === title.trim()) {
      lines.splice(firstContentIndex, 1);
    }
  }

  return normalizeNarrativeLists(lines).join("\n").trim();
}

function normalizeNarrativeLists(lines: string[]) {
  const listSectionPattern = /^#{2,3}\s*(핵심\s*요약|읽는\s*법|해석|종합\s*평가)\b/;
  const headingPattern = /^#{1,6}\s+/;
  const tablePattern = /^\s*\|/;
  const result: string[] = [];
  let inListSection = false;
  let currentListSection = "";
  let paragraphSeenInSummary = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (listSectionPattern.test(trimmed)) {
      inListSection = true;
      currentListSection = trimmed;
      paragraphSeenInSummary = false;
      result.push(line);
      continue;
    }
    if (headingPattern.test(trimmed)) {
      inListSection = false;
      currentListSection = "";
      paragraphSeenInSummary = false;
      result.push(line);
      continue;
    }
    if (!inListSection || !trimmed || tablePattern.test(trimmed) || /^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      result.push(line);
      continue;
    }

    if (/^##\s*종합\s*평가\b/.test(currentListSection) && !paragraphSeenInSummary) {
      paragraphSeenInSummary = true;
      result.push(line);
      continue;
    }

    if (/^##\s*종합\s*평가\b/.test(currentListSection) && result.at(-1)?.trim() === "") {
      result.push(line.replace(/^(\s*)/, "$1- "));
      continue;
    }

    if (/[.!?。)]$/.test(trimmed) || trimmed.length <= 140) {
      result.push(line.replace(/^(\s*)/, "$1- "));
      continue;
    }

    result.push(line);
  }

  return result;
}

export function buildDocument(markdown: string, opts: { title?: string; subtitle?: string } = {}) {
  const lines = normalizeMarkdown(markdown, opts.title).split("\n");
  const children: Array<Paragraph | Table> = [];
  let index = 0;

  if (opts.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ bold: true, color: COLOR.accent, font: FONT, size: 18, text: "REFINE DOCUMENT" })],
        spacing: { after: 220 }
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ bold: true, color: COLOR.heading, font: FONT, size: 42, text: opts.title })],
        spacing: { after: opts.subtitle ? 70 : 120 }
      })
    );
    if (opts.subtitle) {
      children.push(
        new Paragraph({
          children: [new TextRun({ color: COLOR.muted, font: FONT, size: 19, text: opts.subtitle })],
          spacing: { after: 170 }
        })
      );
    }
    children.push(
      new Paragraph({
        border: { bottom: { color: COLOR.accent, size: 10, style: BorderStyle.SINGLE } },
        children: [],
        spacing: { after: 280 }
      })
    );
  }

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      code.forEach((codeLine) =>
        children.push(
          new Paragraph({
            children: [new TextRun({ color: "30323C", font: CODE_FONT, size: 19, text: codeLine || " " })],
            indent: { left: 120 },
            shading: { color: "F6F6F9", fill: "F6F6F9", type: ShadingType.SOLID },
            spacing: { after: 0, line: 252 }
          })
        )
      );
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
      continue;
    }

    if (/\|/.test(line) && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1])) {
      const tableLines = [line];
      index += 2;
      while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      children.push(
        makeTable(tableLines.map((tableLine) => tableLine.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|")))
      );
      children.push(new Paragraph({ children: [], spacing: { after: 140 } }));
      continue;
    }

    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      children.push(makeHeading(heading[2], heading[1].length));
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      children.push(
        new Paragraph({
          border: { bottom: { color: COLOR.border, size: 4, style: BorderStyle.SINGLE } },
          children: [],
          spacing: { after: 140, before: 140 }
        })
      );
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      children.push(
        new Paragraph({
          border: { left: { color: "C9C5F0", size: 18, space: 14, style: BorderStyle.SINGLE } },
          children: parseInline(trimmed.replace(/^>\s?/, ""), { color: "55576A", italics: true }),
          indent: { left: 360 },
          spacing: { after: 100, line: 288 }
        })
      );
      index += 1;
      continue;
    }

    const indent = /^(\s*)/.exec(line)?.[1].length || 0;
    const unordered = /^[-*+]\s+(.*)$/.exec(line.replace(/^\s+/, ""));
    if (unordered) {
      children.push(
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
      children.push(
        new Paragraph({
          children: parseInline(ordered[2]),
          numbering: { level: Math.min(Math.floor(indent / 2), 3), reference: "md-ol" },
          spacing: { after: 65, line: 288 }
        })
      );
      index += 1;
      continue;
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: parseInline(trimmed),
        spacing: { after: 150, line: 310 }
      })
    );
    index += 1;
  }

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
          reference: "md-ol"
        }
      ]
    },
    sections: [
      {
        children: children.length ? children : [new Paragraph({ children: [] })],
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], color: "98A2B3", font: FONT, size: 17 })]
              })
            ]
          })
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ color: COLOR.muted, font: FONT, size: 16, text: opts.title || "Refine" })]
              })
            ]
          })
        },
        properties: { page: { margin: { bottom: 1250, left: 1350, right: 1350, top: 1250 } } }
      }
    ],
    styles: {
      default: {
        document: { run: { color: COLOR.text, font: FONT, size: 21 }, paragraph: { spacing: { after: 150, line: 310 } } },
        heading1: { paragraph: { spacing: { after: 180, before: 340 } }, run: { bold: true, color: COLOR.heading, font: FONT, size: 32 } },
        heading2: { paragraph: { spacing: { after: 110, before: 260 } }, run: { bold: true, color: COLOR.heading, font: FONT, size: 26 } },
        heading3: { paragraph: { spacing: { after: 85, before: 210 } }, run: { bold: true, color: "344054", font: FONT, size: 23 } },
        heading4: { paragraph: { spacing: { after: 70, before: 170 } }, run: { bold: true, color: "475467", font: FONT, size: 21 } }
      }
    }
  });
}

export async function markdownToDocxBlob(markdown: string, opts: { title?: string; subtitle?: string } = {}) {
  return Packer.toBlob(buildDocument(markdown, opts));
}
