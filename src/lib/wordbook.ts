import type { WordEntry } from "../types";

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayLabel(key: string, now: number = Date.now()): string {
  if (key === dayKey(now)) return "今天";
  if (key === dayKey(now - 86_400_000)) return "昨天";
  return key;
}

export type DayGroup = {
  day: string;
  label: string;
  entries: WordEntry[];
};

export function groupByDay(
  entries: WordEntry[],
  now: number = Date.now(),
): DayGroup[] {
  const groups = new Map<string, WordEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.addedAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => ({
      day,
      label: dayLabel(day, now),
      entries: [...list].sort((a, b) => b.addedAt - a.addedAt),
    }));
}

export function addWord(
  wordbook: Record<string, WordEntry>,
  entry: WordEntry,
): Record<string, WordEntry> {
  const existing = wordbook[entry.lemma];
  if (!existing) {
    return { ...wordbook, [entry.lemma]: entry };
  }

  return {
    ...wordbook,
    [entry.lemma]: {
      ...existing,
      ...entry,
      trans: entry.trans.length ? entry.trans : existing.trans,
      addedAt: existing.addedAt,
    },
  };
}

export function removeWord(
  wordbook: Record<string, WordEntry>,
  lemma: string,
): Record<string, WordEntry> {
  if (!(lemma in wordbook)) return wordbook;
  const next = { ...wordbook };
  delete next[lemma];
  return next;
}

export function toggleKnown(known: Set<string>, lemma: string): Set<string> {
  const next = new Set(known);
  if (next.has(lemma)) next.delete(lemma);
  else next.add(lemma);
  return next;
}
