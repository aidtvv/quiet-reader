import { afterEach, describe, expect, it, vi } from "vitest";
import type { WordEntry } from "../types";
import { pushTodayWordsToAnki } from "./ankiConnect";

const TARGET = "考研英语词汇::单词::生词组";
const SOURCE = "考研英语词汇";

function entry(lemma: string): WordEntry {
  return {
    lemma,
    surface: lemma,
    trans: ["释义"],
    lists: ["kaoyan"],
    addedAt: Date.now(),
  };
}

type Call = { action: string; params: Record<string, unknown> };

/** 用一个按 action 分派的假 AnkiConnect 服务替换 fetch。 */
function fakeAnki(
  handle: (call: Call) => unknown | Promise<unknown>,
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Call;
      calls.push(body);
      const result = await handle(body);
      return {
        ok: true,
        json: async () => ({ result, error: null }),
      } as Response;
    }),
  );
  return calls;
}

/** 收集 findCards 里实际的查询语句，方便断言检索范围。 */
function cardQueries(calls: Call[]): string[] {
  return calls
    .filter((c) => c.action === "findCards")
    .map((c) => String(c.params.query));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushTodayWordsToAnki 引用已有牌组", () => {
  it("已在目标牌组的词跳过，源牌组里有的整张移入，都没有的才新建", async () => {
    const fronts: Record<number, string> = {
      9001: "alpha",
      11: "beta",
      12: "beta",
    };
    const calls = fakeAnki(({ action, params }) => {
      switch (action) {
        case "deckNames":
          return [SOURCE, `${SOURCE}::单词`, TARGET];
        case "findCards": {
          const query = String(params.query);
          if (query.includes(`deck:"${TARGET}"`) && query.includes("w:alpha")) {
            return [9001]; // 已在目标子牌组
          }
          if (query.includes(`deck:"${SOURCE}"`) && query.includes("w:beta")) {
            return [11, 12]; // 源牌组里的现成卡片
          }
          return [];
        }
        case "cardsInfo":
          return (params.cards as number[]).map((cardId) => ({
            cardId,
            modelName: "Basic",
            fields: { Front: { value: fronts[cardId] ?? "" } },
          }));
        case "findNotes":
          return [];
        case "modelNames":
          return ["Basic"];
        case "modelFieldNames":
          return ["Front", "Back"];
        case "addNotes":
          return (params.notes as unknown[]).map(() => 500);
        default:
          return null;
      }
    });

    const result = await pushTodayWordsToAnki(
      { alpha: entry("alpha"), beta: entry("beta"), gamma: entry("gamma") },
      TARGET,
      "http://127.0.0.1:8765",
      { reuseExisting: true, sourceDeck: SOURCE },
    );

    expect(result).toEqual({
      total: 3,
      moved: 2,
      added: 1,
      skipped: 0,
      already: 1,
      missing: 0,
    });

    // 目标牌组里的词被识别出来后，不应该再被新建
    const addNotes = calls.filter((c) => c.action === "addNotes");
    expect(addNotes).toHaveLength(1);
    const notes = addNotes[0].params.notes as Array<{
      deckName: string;
      fields: Record<string, string>;
    }>;
    expect(notes).toHaveLength(1);
    expect(notes[0].deckName).toBe(TARGET);
    expect(notes[0].fields.Front).toBe("gamma");

    const moved = calls.filter((c) => c.action === "changeDeck");
    expect(moved).toHaveLength(1);
    expect(moved[0].params).toEqual({ cards: [11, 12], deck: TARGET });

    // 只在源牌组里搜索，避免命中无关牌组
    expect(cardQueries(calls)).toContain(`deck:"${SOURCE}" w:beta`);
    expect(cardQueries(calls)).toContain(`deck:"${TARGET}" w:alpha`);
  });

  it("重复推送时已有卡片不会再进 changeDeck 或 addNotes", async () => {
    const calls = fakeAnki(({ action, params }) => {
      switch (action) {
        case "deckNames":
          return [SOURCE, TARGET];
        case "findCards":
          return String(params.query).includes("w:sustain") ? [1] : [];
        case "cardsInfo":
          return [
            {
              cardId: 1,
              modelName: "Basic",
              fields: { Front: { value: "sustain" } },
            },
          ];
        case "modelNames":
          return ["Basic"];
        case "modelFieldNames":
          return ["Front", "Back"];
        default:
          return null;
      }
    });

    const result = await pushTodayWordsToAnki(
      { sustain: entry("sustain") },
      TARGET,
      "http://127.0.0.1:8765",
      { reuseExisting: true, sourceDeck: SOURCE },
    );

    expect(result.already).toBe(1);
    expect(result.moved).toBe(0);
    expect(result.added).toBe(0);
    expect(calls.some((c) => c.action === "changeDeck")).toBe(false);
    expect(calls.some((c) => c.action === "addNotes")).toBe(false);
  });

  it("只搬这个词自己的卡片，辨析/关系图里顺带命中该词的卡片不动", async () => {
    const calls = fakeAnki(({ action, params }) => {
      switch (action) {
        case "deckNames":
          return [SOURCE, TARGET];
        case "findCards": {
          const query = String(params.query);
          // 目标牌组里没有；源牌组里命中 2 张：单词卡 + 近义词辨析卡
          return query.includes(`deck:"${SOURCE}"`) &&
            query.includes("w:exacerbate")
            ? [201, 202]
            : [];
        }
        case "cardsInfo":
          return [
            {
              cardId: 201,
              modelName: "考研词汇-单词",
              fields: { 英文: { value: "exacerbate" }, 中文: { value: "使恶化" } },
            },
            {
              cardId: 202,
              modelName: "考研词汇-辨析",
              fields: {
                提示: { value: "使恶化" },
                提问: { value: "有哪 3 个词表示这个意思？" },
              },
            },
          ];
        case "modelFieldNames":
          return params.modelName === "考研词汇-单词"
            ? ["英文", "中文"]
            : ["提示", "提问"];
        case "findNotes":
          return [];
        case "modelNames":
          return ["Basic"];
        case "addNotes":
          return [300];
        default:
          return null;
      }
    });

    const result = await pushTodayWordsToAnki(
      { exacerbate: entry("exacerbate") },
      TARGET,
      "http://127.0.0.1:8765",
      { reuseExisting: true, sourceDeck: SOURCE },
    );

    const moved = calls.find((c) => c.action === "changeDeck");
    expect(moved?.params).toEqual({ cards: [201], deck: TARGET });
    expect(result.moved).toBe(1);
    expect(result.added).toBe(0);
  });

  it("源牌组不存在时抛出可读的错误", async () => {
    fakeAnki(({ action }) => (action === "deckNames" ? [TARGET] : null));

    await expect(
      pushTodayWordsToAnki(
        { alpha: entry("alpha") },
        TARGET,
        "http://127.0.0.1:8765",
        { reuseExisting: true, sourceDeck: "不存在的牌组" },
      ),
    ).rejects.toThrow("源牌组「不存在的牌组」不存在");
  });
});

describe("pushTodayWordsToAnki 不引用已有牌组", () => {
  it("直接新建，不再搜索源牌组", async () => {
    const calls = fakeAnki(({ action }) => {
      switch (action) {
        case "findNotes":
          return [];
        case "modelNames":
          return ["Basic"];
        case "modelFieldNames":
          return ["Front", "Back"];
        case "addNotes":
          return [7];
        default:
          return [];
      }
    });

    const result = await pushTodayWordsToAnki(
      { alpha: entry("alpha") },
      TARGET,
      "http://127.0.0.1:8765",
      { reuseExisting: false, sourceDeck: SOURCE },
    );

    expect(result).toMatchObject({ total: 1, moved: 0, added: 1, already: 0 });
    expect(calls.some((c) => c.action === "findCards")).toBe(false);
  });
});
