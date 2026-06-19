export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderMarkdown(source: string) {
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

export function downloadTextFile(fileName: string, contents: string, type: string) {
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

export function safeFileStem(value: string) {
  return (value || "analysis")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w가-힣.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "analysis";
}
