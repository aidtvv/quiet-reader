import type { DictEntry, PluginMeta, WordListEntry } from "../types";

export type { DictEntry } from "../types";

export type DictIndex = {
  byWord: Map<string, DictEntry>;
  phrases: Map<string, DictEntry>;
  maxPhraseTokens: number;
  lemmaMap: Record<string, string>;
};

export type WordToken = {
  raw: string;
  lower: string;
  start: number;
  end: number;
};

const WORD_PATTERN = /[A-Za-z][A-Za-z'’-]*/g;
const MAX_PHRASE_TOKENS = 4;

export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']s$/, "")
    .replace(/^[’']+|[’']+$/g, "");
}

export function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const match of text.matchAll(WORD_PATTERN)) {
    const raw = match[0];
    tokens.push({
      raw,
      lower: normalizeWord(raw),
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length,
    });
  }
  return tokens;
}

function addEntry(
  target: Map<string, DictEntry>,
  key: string,
  lemma: string,
  entry: WordListEntry,
  listId: string,
): void {
  const existing = target.get(key);
  if (existing) {
    if (!existing.lists.includes(listId)) existing.lists.push(listId);
    return;
  }
  target.set(key, { lemma, entry, lists: [listId] });
}

export function buildIndex(
  lists: { meta: PluginMeta; entries: WordListEntry[] }[],
  lemmaMap: Record<string, string>,
): DictIndex {
  const byWord = new Map<string, DictEntry>();
  const phrases = new Map<string, DictEntry>();

  for (const { meta, entries } of lists) {
    for (const entry of entries) {
      const name = entry.name?.trim();
      if (!name) continue;

      const key = name.toLowerCase();
      const tokens = key.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        if (tokens.length > MAX_PHRASE_TOKENS) continue;
        addEntry(phrases, tokens.join(" "), tokens.join(" "), entry, meta.id);
      } else {
        addEntry(byWord, normalizeWord(key), normalizeWord(key), entry, meta.id);
      }
    }
  }

  const normalizedLemma: Record<string, string> = {};
  for (const [from, to] of Object.entries(lemmaMap)) {
    normalizedLemma[from.toLowerCase()] = to.toLowerCase();
  }

  let maxPhraseTokens = 0;
  for (const key of phrases.keys()) {
    maxPhraseTokens = Math.max(maxPhraseTokens, key.split(" ").length);
  }

  return {
    byWord,
    phrases,
    maxPhraseTokens,
    lemmaMap: normalizedLemma,
  };
}

export function lookup(index: DictIndex, raw: string): DictEntry | null {
  const key = normalizeWord(raw.trim());
  if (!key) return null;

  const exact = index.byWord.get(key) ?? index.phrases.get(key);
  if (exact) return exact;

  const lemma = index.lemmaMap[key];
  if (!lemma) return null;

  return index.byWord.get(lemma) ?? index.phrases.get(lemma) ?? null;
}

export function analyzeText(
  index: DictIndex,
  text: string,
  exclude?: Set<string>,
): number {
  return matchedLemmas(index, text, exclude).size;
}

export function matchedLemmas(
  index: DictIndex,
  text: string,
  exclude?: Set<string>,
): Set<string> {
  const tokens = tokenizeWords(text);
  const matched = new Set<string>();
  const isExcluded = (lemma: string) => Boolean(exclude?.has(lemma));

  for (let i = 0; i < tokens.length; ) {
    let consumed = 1;
    let phraseHit: DictEntry | undefined;

    for (
      let size = Math.min(index.maxPhraseTokens, tokens.length - i);
      size >= 2;
      size--
    ) {
      const candidate = tokens
        .slice(i, i + size)
        .map((token) => token.lower)
        .join(" ");
      const hit = index.phrases.get(candidate);
      if (hit) {
        phraseHit = hit;
        consumed = size;
        break;
      }
    }

    const hit = phraseHit ?? lookup(index, tokens[i].lower);
    if (hit && !isExcluded(hit.lemma)) matched.add(hit.lemma);
    i += consumed;
  }

  return matched;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`加载失败（${response.status}）：${url}`);
  }
  return (await response.json()) as T;
}

function normalizeEntries(raw: unknown): WordListEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): WordListEntry | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name = record.name ?? record.word;
      if (typeof name !== "string" || !name.trim()) return null;

      const rawTrans = record.trans ?? record.translation ?? record.translations;
      const trans = Array.isArray(rawTrans)
        ? rawTrans.filter((line): line is string => typeof line === "string")
        : typeof rawTrans === "string"
          ? rawTrans.split(/\r?\n/).filter(Boolean)
          : [];

      const usphone =
        typeof record.usphone === "string"
          ? record.usphone
          : typeof record.phonetic === "string"
            ? record.phonetic
            : undefined;

      return {
        name: name.trim(),
        trans,
        usphone,
        ukphone: typeof record.ukphone === "string" ? record.ukphone : undefined,
      };
    })
    .filter((entry): entry is WordListEntry => entry !== null);
}

export async function loadPluginData(
  meta: PluginMeta,
  baseUrl = "/plugins/",
): Promise<WordListEntry[]> {
  const url = /^https?:/i.test(meta.file)
    ? meta.file
    : `${baseUrl.replace(/\/?$/, "/")}${meta.file}`;
  return normalizeEntries(await fetchJson<unknown>(url));
}

export async function loadLemmaMap(baseUrl = "/plugins/"): Promise<Record<string, string>> {
  const url = `${baseUrl.replace(/\/?$/, "/")}lemma.json`;
  const data = await fetchJson<unknown>(url);
  if (!data || typeof data !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === "string") result[key.toLowerCase()] = value;
  }
  return result;
}

export async function loadManifest(baseUrl = "/plugins/"): Promise<PluginMeta[]> {
  const url = `${baseUrl.replace(/\/?$/, "/")}plugins.json`;
  const data = await fetchJson<{ plugins?: PluginMeta[] }>(url);
  return Array.isArray(data.plugins) ? data.plugins : [];
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

export function parseCustomEntryList(
  fileName: string,
  text: string,
): { name: string; entries: WordListEntry[] } {
  const name = fileName.replace(/\.[^.]+$/, "").trim() || "自定义词表";

  if (/\.csv$/i.test(fileName)) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return { name, entries: [] };

    const header = parseCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
    const wordIndex = header.findIndex((cell) =>
      ["word", "name", "单词"].includes(cell),
    );
    const transIndex = header.findIndex((cell) =>
      ["translation", "trans", "meaning", "释义"].includes(cell),
    );
    const phoneticIndex = header.findIndex((cell) =>
      ["phonetic", "usphone", "音标"].includes(cell),
    );

    const entries: WordListEntry[] = [];
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const word = (cells[wordIndex >= 0 ? wordIndex : 0] ?? "").trim();
      if (!word) continue;
      const translations =
        transIndex >= 0 ? (cells[transIndex] ?? "").trim() : "";
      entries.push({
        name: word,
        trans: translations ? translations.split(/[;；]/).map((part) => part.trim()).filter(Boolean) : [],
        usphone:
          phoneticIndex >= 0
            ? (cells[phoneticIndex] ?? "").trim() || undefined
            : undefined,
      });
    }
    return { name, entries };
  }

  try {
    return { name, entries: normalizeEntries(JSON.parse(text)) };
  } catch {
    return { name, entries: [] };
  }
}
