export type ExtractParseResult = {
  page: number | null;
  md: string;
};

export type ReviewNote = {
  type: string;
  detail: string;
};

export function stripCodeFence(text: string) {
  return text.trim().replace(/^```[a-z]*\s*/i, "").replace(/```$/u, "").trim();
}

export function parseExtract(text: string): ExtractParseResult {
  const source = stripCodeFence(text || "");
  const pageMatch = source.match(/@@PAGE:\s*([^\n]+)/i);
  const pageValue = pageMatch ? Number.parseInt(pageMatch[1], 10) : Number.NaN;
  const page = Number.isNaN(pageValue) ? null : pageValue;
  const contentIndex = source.search(/@@CONTENT/i);
  const md =
    contentIndex >= 0
      ? source.slice(contentIndex).replace(/@@CONTENT[^\n]*\n?/i, "").trim()
      : source.replace(/@@PAGE:[^\n]*\n?/i, "").trim();

  return { page, md: md || source };
}

export function parseReview(text: string): { reviewed: string; notes: ReviewNote[] } {
  const source = stripCodeFence(text || "");
  const documentIndex = source.search(/@@DOCUMENT/i);
  const notesIndexInSource = source.search(/@@NOTES/i);
  if (documentIndex < 0 && notesIndexInSource < 0) return { reviewed: removeControlMarkers(source), notes: [] };

  const head = documentIndex >= 0 ? source.slice(0, documentIndex) : source;
  const reviewed = documentIndex >= 0
    ? removeControlMarkers(source.slice(documentIndex).replace(/@@DOCUMENT[^\n]*\n?/i, "").trim())
    : "";
  const notesIndex = head.search(/@@NOTES/i);
  const notesBlock = notesIndex >= 0 ? head.slice(notesIndex).replace(/@@NOTES[^\n]*\n?/i, "") : head;
  const notes = notesBlock
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("|");
      if (separator >= 0) {
        return {
          type: line.slice(0, separator).trim() || "변경",
          detail: line.slice(separator + 1).trim()
        };
      }
      return { type: "변경", detail: line };
    });

  return { reviewed, notes };
}

function removeControlMarkers(text: string) {
  return text
    .replace(/^@@NOTES\b.*$/gim, "")
    .replace(/^@@DOCUMENT\b.*$/gim, "")
    .trim();
}
