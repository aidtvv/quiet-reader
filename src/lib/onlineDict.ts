import { invoke } from "@tauri-apps/api/core";

export type OnlineMeaning = {
  partOfSpeech: string;
  definitions: {
    definition: string;
    example?: string;
  }[];
  synonyms: string[];
};

export type RelatedWord = {
  word: string;
  pos: string;
  tran: string;
};

export type OnlineWordDetail = {
  word: string;
  source?: string;
  phonetic?: string;
  audioUrl?: string;
  origin?: string;
  meanings: OnlineMeaning[];
  derivatives?: RelatedWord[];
  synonyms?: string[];
};

const wordCache = new Map<string, OnlineWordDetail | null>();
const sentenceCache = new Map<string, string>();

/**
 * 调用 Free Dictionary API 获取权威英英释义、词源、同义词与发音。
 */
export async function fetchWordDetail(
  word: string,
  signal?: AbortSignal,
): Promise<OnlineWordDetail | null> {
  const key = word.trim().toLowerCase();
  if (!key) return null;
  if (wordCache.has(key)) return wordCache.get(key) ?? null;

  // 优先走 Tauri Rust 后端抓取权威词典（柯林斯双解 + 派生词 + 中文词源 + 本地缓存）
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const tauriRes = await invoke<{
        word: string;
        source: string;
        phonetic?: string;
        etymology?: string;
        meanings: { pos: string; tran: string; example?: string }[];
        derivatives: RelatedWord[];
        synonyms: string[];
      } | null>("lookup_authoritative_dict", { word: key });

      if (tauriRes) {
        const detail: OnlineWordDetail = {
          word: tauriRes.word,
          source: tauriRes.source,
          phonetic: tauriRes.phonetic,
          origin: tauriRes.etymology,
          meanings: tauriRes.meanings.map((m) => ({
            partOfSpeech: m.pos,
            definitions: [{ definition: m.tran, example: m.example }],
            synonyms: [],
          })),
          derivatives: tauriRes.derivatives,
          synonyms: tauriRes.synonyms,
        };
        wordCache.set(key, detail);
        return detail;
      }
    } catch {
      // 后端失败时自动降级到 Free Dictionary API
    }
  }

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`,
      { signal },
    );
    if (!res.ok) {
      if (res.status === 404) wordCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as Array<{
      word?: string;
      phonetic?: string;
      origin?: string;
      phonetics?: Array<{ text?: string; audio?: string }>;
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
        synonyms?: string[];
      }>;
    }>;
    const first = data[0];
    if (!first) return null;

    const audioUrl = first.phonetics?.find((p) => p.audio)?.audio;
    const phonetic =
      first.phonetic || first.phonetics?.find((p) => p.text)?.text;

    const meanings: OnlineMeaning[] = (first.meanings ?? [])
      .slice(0, 3)
      .map((m) => ({
        partOfSpeech: m.partOfSpeech ?? "",
        definitions: (m.definitions ?? [])
          .slice(0, 2)
          .filter((d) => Boolean(d.definition))
          .map((d) => ({
            definition: d.definition!,
            example: d.example,
          })),
        synonyms: (m.synonyms ?? []).slice(0, 6),
      }))
      .filter((m) => m.definitions.length > 0);

    const detail: OnlineWordDetail = {
      word: first.word ?? key,
      phonetic,
      audioUrl,
      origin: first.origin,
      meanings,
    };
    wordCache.set(key, detail);
    return detail;
  } catch {
    return null;
  }
}

/**
 * 调用 MyMemory 翻译 API 解释划取的英文句子。
 */
export async function translateSentence(
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (sentenceCache.has(trimmed)) return sentenceCache.get(trimmed)!;

  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed.slice(0, 500))}&langpair=en|zh-CN`,
      { signal },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const translated = data.responseData?.translatedText?.trim();
    if (!translated) return null;
    sentenceCache.set(trimmed, translated);
    return translated;
  } catch {
    return null;
  }
}
