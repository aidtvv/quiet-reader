import { invoke } from "@tauri-apps/api/core";
import type { WordEntry } from "../types";

export const DEFAULT_ANKI_CONNECT_URL = "http://127.0.0.1:8765";
export const DEFAULT_ANKI_TARGET_DECK = "考研英语词汇::单词::生词组";

type AnkiResponse<T> = {
  result: T;
  error: string | null;
};

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function ankiInvoke<T>(
  action: string,
  params: Record<string, unknown> = {},
  url = DEFAULT_ANKI_CONNECT_URL,
): Promise<T> {
  // 桌面端走 Rust 转发：AnkiConnect 默认 CORS 白名单不包含 tauri.localhost，
  // 浏览器 fetch 会被拦截，只有后端直连才稳定可用。
  if (inTauri()) {
    return invoke<T>("anki_invoke", { action, params, url });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch {
    throw new Error(
      `无法连接 ${url}。请确认 Anki 已开启并安装 AnkiConnect；` +
        `浏览器预览还受 CORS 限制，可把 ${window.location.origin} 加入 AnkiConnect 的 webCorsOriginList。`,
    );
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as AnkiResponse<T>;
  if (data.error) {
    throw new Error(data.error);
  }
  return data.result;
}

export async function checkAnkiConnect(
  url = DEFAULT_ANKI_CONNECT_URL,
): Promise<number> {
  return ankiInvoke<number>("version", {}, url);
}

export async function getAnkiDecks(
  url = DEFAULT_ANKI_CONNECT_URL,
): Promise<string[]> {
  return ankiInvoke<string[]>("deckNames", {}, url);
}

export async function createAnkiDeck(
  deckName: string,
  url = DEFAULT_ANKI_CONNECT_URL,
): Promise<number> {
  return ankiInvoke<number>("createDeck", { deck: deckName }, url);
}

export function todayWordbookEntries(
  wordbook: Record<string, WordEntry>,
): WordEntry[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const ts = start.getTime();
  return Object.values(wordbook).filter((entry) => entry.addedAt >= ts);
}

type NoteModel = { modelName: string; frontField: string; backField: string };

/**
 * 解析要使用的笔记类型，优先级：
 * 1. 目标牌组（含上级牌组）里已有卡片所用的模型 —— 沿用你自己的模板；
 * 2. 带 Front/Back 之类字段的模型（兼容英文版 Basic）；
 * 3. 名称像单词卡的模型；
 * 4. 任意至少两个字段的模型。
 *
 * 很多用户的 Anki 里没有英文 "Basic"（被汉化或自建），写死会直接失败。
 */
async function resolveNoteModel(
  deckName: string,
  url: string,
): Promise<NoteModel> {
  const fieldNames = (model: string) =>
    ankiInvoke<string[]>("modelFieldNames", { modelName: model }, url);

  // 1. 从目标牌组逐级向上找已有卡片
  const parts = deckName.split("::");
  for (let depth = parts.length; depth >= 1; depth--) {
    const probe = parts.slice(0, depth).join("::");
    try {
      const ids = await ankiInvoke<number[]>(
        "findNotes",
        { query: `deck:"${probe}"` },
        url,
      );
      if (!ids.length) continue;
      const [info] = await ankiInvoke<Array<{ modelName: string }>>(
        "notesInfo",
        { notes: [ids[0]] },
        url,
      );
      if (!info?.modelName) continue;
      const fields = await fieldNames(info.modelName);
      if (fields.length >= 2) {
        return {
          modelName: info.modelName,
          frontField: fields[0],
          backField: fields[1],
        };
      }
    } catch {
      // 该层牌组不存在或查询失败，继续向上。
    }
  }

  // 2~4. 通用模型探测
  const models = await ankiInvoke<string[]>("modelNames", {}, url);
  const candidates: (NoteModel & { score: number })[] = [];
  for (const model of models) {
    try {
      const fields = await fieldNames(model);
      if (fields.length < 2) continue;
      const frontIdx = fields.findIndex((f) =>
        /^(front|word|term|单词|英文|正面)$/i.test(f),
      );
      const backIdx = fields.findIndex((f) =>
        /^(back|meaning|definition|translation|释义|词义|中文|背面)$/i.test(f),
      );
      let score = 0;
      if (model === "Basic") score += 100;
      if (frontIdx >= 0) score += 10;
      if (backIdx >= 0) score += 10;
      if (/(basic|基本|单词|词汇|vocab)/i.test(model)) score += 5;
      candidates.push({
        modelName: model,
        frontField: frontIdx >= 0 ? fields[frontIdx] : fields[0],
        backField: backIdx >= 0 ? fields[backIdx] : fields[1],
        score,
      });
    } catch {
      // 跳过读不到字段的模型。
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length) {
    const { modelName, frontField, backField } = candidates[0];
    return { modelName, frontField, backField };
  }
  throw new Error("Anki 中没有可用的笔记类型（需要至少两个字段）");
}

export type PushOptions = {
  /** 引用已有牌组：把牌组里现成的卡片移到目标子牌组（而不是新建卡片）。 */
  reuseExisting?: boolean;
  /** 引用时检索的源牌组；留空则在整份收藏中查找。 */
  sourceDeck?: string;
};

export type PushResult = {
  total: number;
  /** 从已有牌组移入目标牌组的卡片数。 */
  moved: number;
  /** 新建的卡片数（源牌组里没收录的词）。 */
  added: number;
  /** 新建时因重复被跳过的数量。 */
  skipped: number;
  /** 目标牌组里本来就有、无需处理的词数。 */
  already: number;
  /** 引用失败、也没能新建的词。 */
  missing: number;
};

/** 转义 Anki 搜索里的引号，避免牌组名 / 单词破坏查询语法。 */
function quoteForSearch(value: string): string {
  return value.replace(/"/g, '\\"');
}

/** 去掉字段里的 HTML 与多余空白，用于比对单词。 */
function plainField(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 判断一张卡是不是「这个词自己的卡片」。
 * Anki 的 w: 搜索会把近义词辨析、关系图里提到该词的卡片也一起命中，
 * 那些卡片通常属于别的牌组结构，不能一起搬走。
 */
function isWordCard(word: string, firstField: string): boolean {
  const front = plainField(firstField).toLowerCase();
  const target = word.trim().toLowerCase();
  if (!front || !target) return false;
  if (front === target) return true;
  // 有的模板把词性写进同一个字段，例如 "exacerbate vt."
  return new RegExp(`^${escapeRegExp(target)}(?:\\s|[(（\\[,.;:]|$)`).test(front)
    ? true
    : false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 在已有牌组里查找某个词对应的卡片。
 * 先按整词匹配（w:），再按模板首字段过滤，只保留词本身的卡片。
 */
async function findCardsForWord(
  word: string,
  sourceDeck: string,
  url: string,
): Promise<number[]> {
  const trimmed = sourceDeck.trim();
  const deckScope = trimmed ? `deck:"${quoteForSearch(trimmed)}" ` : "";
  const safeWord = quoteForSearch(word.trim());
  if (!safeWord) return [];

  const queries = [
    // 整词匹配，避免 see 命中 seafood
    `${deckScope}w:${safeWord}`,
    // 短语或分词不适用 w: 时退回全文匹配
    `${deckScope}"${safeWord}"`,
  ];

  for (const query of queries) {
    let ids: number[] = [];
    try {
      ids = await ankiInvoke<number[]>("findCards", { query }, url);
    } catch {
      // 查询语法不被当前 Anki 版本支持时继续尝试下一种。
      continue;
    }
    if (!ids.length) continue;

    const infos = await ankiInvoke<CardInfo[]>("cardsInfo", { cards: ids }, url);
    const own: number[] = [];
    for (const card of infos) {
      const frontField = await frontFieldName(card.modelName, url);
      if (!frontField) continue;
      const front = card.fields?.[frontField]?.value ?? "";
      if (isWordCard(word, front)) own.push(card.cardId);
    }
    if (own.length) return own;
    // 搜到了别家的卡片（辨析、关系图），继续尝试下一种查询。
  }
  return [];
}

type CardInfo = {
  cardId: number;
  modelName: string;
  fields?: Record<string, { value: string }>;
};

const frontFieldCache = new Map<string, Promise<string>>();

/** 取模板的第一个字段作为「正面」。 */
function frontFieldName(modelName: string, url: string): Promise<string> {
  const key = `${url}|${modelName}`;
  let pending = frontFieldCache.get(key);
  if (!pending) {
    pending = ankiInvoke<string[]>("modelFieldNames", { modelName }, url)
      .then((fields) => fields[0] ?? "")
      .catch(() => "");
    frontFieldCache.set(key, pending);
  }
  return pending;
}

export async function pushTodayWordsToAnki(
  wordbook: Record<string, WordEntry>,
  deckName: string,
  url = DEFAULT_ANKI_CONNECT_URL,
  options: PushOptions = {},
): Promise<PushResult> {
  const today = todayWordbookEntries(wordbook);
  if (!today.length) {
    return {
      total: 0,
      moved: 0,
      added: 0,
      skipped: 0,
      already: 0,
      missing: 0,
    };
  }

  const created = options.reuseExisting
    ? await moveThenAdd(today, deckName, url, options.sourceDeck ?? "")
    : { ...(await addNewNotes(today, deckName, url)), moved: 0, already: 0 };

  return {
    total: today.length,
    moved: created.moved,
    added: created.added,
    skipped: created.skipped,
    already: created.already,
    missing: 0,
  };
}

/**
 * 引用已有牌组：目标牌组里已经有该词就跳过（保证重复推送不会制造重复卡），
 * 源牌组里有就整张卡移进来，都没有才新建。
 */
async function moveThenAdd(
  entries: WordEntry[],
  deckName: string,
  url: string,
  sourceDeck: string,
) {
  const source = sourceDeck.trim();
  if (source) {
    const decks = await getAnkiDecks(url);
    if (!decks.includes(source)) {
      throw new Error(`源牌组「${source}」不存在，请在设置里重新选择`);
    }
  }

  const movable: number[] = [];
  const toCreate: WordEntry[] = [];
  let already = 0;

  for (const entry of entries) {
    // 1. 已在目标子牌组：什么都不用做
    const inTarget = await findCardsForWord(entry.lemma, deckName, url);
    if (inTarget.length) {
      already += 1;
      continue;
    }
    // 2. 源牌组里的现成卡片：整张移过来
    const inSource = await findCardsForWord(entry.lemma, source, url);
    if (inSource.length) {
      movable.push(...inSource);
      continue;
    }
    // 3. 源牌组没收录：按新卡处理，保证今天的词都能复习
    toCreate.push(entry);
  }

  let moved = 0;
  if (movable.length) {
    await ankiInvoke<number>("changeDeck", { cards: movable, deck: deckName }, url);
    moved = movable.length;
  }

  const created = toCreate.length
    ? await addNewNotes(toCreate, deckName, url)
    : { added: 0, skipped: 0 };

  return { ...created, moved, already };
}


async function addNewNotes(
  entries: WordEntry[],
  deckName: string,
  url: string,
): Promise<{ added: number; skipped: number }> {
  const model = await resolveNoteModel(deckName, url);

  const notes = entries.map((entry) => {
    const front = entry.phonetic
      ? `${entry.lemma} <span style="color:#888;font-size:14px">${entry.phonetic}</span>`
      : entry.lemma;
    const trans = entry.trans.join("<br>");
    const ctx = entry.sentence
      ? `<hr><div style="font-size:13px;color:#666">${entry.sentence}</div>`
      : "";
    return {
      deckName,
      modelName: model.modelName,
      fields: {
        [model.frontField]: front,
        [model.backField]: `${trans}${ctx}`,
      },
      options: {
        allowDuplicate: false,
      },
      tags: ["quiet-reader", "today"],
    };
  });

  const results = await ankiInvoke<Array<number | null>>(
    "addNotes",
    { notes },
    url,
  );
  const added = results.filter((id) => id !== null).length;
  return {
    added,
    skipped: entries.length - added,
  };
}
