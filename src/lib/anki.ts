import type { WordEntry } from "../types";

const HEADER = ["Word", "Phonetic", "Meaning", "Context", "Source", "Added"];

function cell(value: string | undefined): string {
  return (value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function sourceOf(entry: WordEntry): string {
  return [entry.bookTitle, entry.section, entry.articleTitle]
    .map((part) => cell(part))
    .filter(Boolean)
    .join(" · ");
}

export function toAnkiTsv(entries: WordEntry[]): string {
  const rows = [HEADER.join("\t")];

  for (const entry of entries) {
    const meaning = entry.trans.map(cell).filter(Boolean).join("<br>");
    rows.push(
      [
        cell(entry.lemma),
        cell(entry.phonetic),
        meaning,
        cell(entry.sentence),
        sourceOf(entry),
        formatDate(entry.addedAt),
      ].join("\t"),
    );
  }

  return rows.join("\n");
}

export function ankiFileName(now: number = Date.now()): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `quiet-reader-anki-${year}-${month}-${day}.tsv`;
}

export function downloadText(
  filename: string,
  content: string,
  mime = "text/tab-separated-values;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyText(content: string): Promise<void> {
  await navigator.clipboard.writeText(content);
}
