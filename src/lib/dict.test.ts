import { describe, expect, it } from "vitest";
import type { PluginMeta, WordListEntry } from "../types";
import {
  analyzeText,
  buildIndex,
  loadPluginData,
  lookup,
  normalizeWord,
  tokenizeWords,
} from "./dict";

function meta(id: string, name: string): PluginMeta {
  return {
    id,
    name,
    type: "wordlist",
    wordCount: 0,
    matchableCount: 0,
    source: "test",
    license: "test",
    file: `${id}.json`,
  };
}

function entry(name: string, trans: string[] = ["释义"]): WordListEntry {
  return { name, trans, usphone: "fəˈnetɪk" };
}

const kaoyan = meta("kaoyan", "考研红宝书");
const cet6 = meta("cet6", "六级");

const index = buildIndex(
  [
    {
      meta: kaoyan,
      entries: [
        entry("perceive"),
        entry("company"),
        entry("they"),
        entry("according to", ["根据"]),
        entry("per cent", ["百分之"]),
      ],
    },
    {
      meta: cet6,
      entries: [entry("perceive", ["v. 察觉"]), entry("sustain")],
    },
  ],
  {
    perceived: "perceive",
    companies: "company",
    sustaining: "sustain",
    they: "he",
  },
);

describe("buildIndex and lookup", () => {
  it("finds an exact headword", () => {
    expect(lookup(index, "perceive")?.lemma).toBe("perceive");
    expect(lookup(index, "Perceive")?.entry.trans).toEqual(["释义"]);
  });

  it("restores an inflected form through the lemma map", () => {
    expect(lookup(index, "perceived")?.lemma).toBe("perceive");
    expect(lookup(index, "Companies")?.lemma).toBe("company");
    expect(lookup(index, "sustaining")?.lemma).toBe("sustain");
  });

  it("prefers an exact match over a noisy lemma mapping", () => {
    expect(lookup(index, "they")?.lemma).toBe("they");
  });

  it("strips a possessive", () => {
    expect(lookup(index, "company's")?.lemma).toBe("company");
    expect(lookup(index, "company’s")?.lemma).toBe("company");
  });

  it("merges list ids for the same word", () => {
    expect(lookup(index, "perceive")?.lists).toEqual(["kaoyan", "cet6"]);
  });

  it("returns null for a word outside the enabled lists", () => {
    expect(lookup(index, "unlisted")).toBeNull();
    expect(lookup(index, "")).toBeNull();
  });

  it("indexes phrases with their token length", () => {
    expect(index.phrases.has("according to")).toBe(true);
    expect(index.byWord.has("according to")).toBe(false);
    expect(index.maxPhraseTokens).toBe(2);
    expect(lookup(index, "according to")?.lemma).toBe("according to");
  });
});

describe("tokenizeWords", () => {
  it("keeps apostrophes and hyphenated words together", () => {
    const tokens = tokenizeWords("Don't re-read the company's report.");
    expect(tokens.map((token) => token.raw)).toEqual([
      "Don't",
      "re-read",
      "the",
      "company's",
      "report",
    ]);
    expect(tokens[0].start).toBe(0);
    expect(normalizeWord("Don't")).toBe("don't");
    expect(normalizeWord("company’s")).toBe("company");
  });
});

describe("analyzeText", () => {
  it("counts unique lemmas and treats a phrase as one entry", () => {
    const text =
      "Companies are sustaining growth according to the report; companies again, per cent.";
    expect(analyzeText(index, text)).toBe(4);
  });

  it("is zero when nothing matches", () => {
    expect(analyzeText(index, "nothing here matches at all")).toBe(0);
  });
});

describe("loadPluginData", () => {
  it("normalizes the supported entry shapes", async () => {
    const fetchMock = async () =>
      new Response(
        JSON.stringify([
          { name: "alpha", trans: ["a"], usphone: "ˈælfə" },
          { word: "beta", translation: "b1\nb2", phonetic: "ˈbiːtə" },
          { notaword: true },
        ]),
        { status: 200 },
      );

    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const entries = await loadPluginData(meta("custom", "自定义"), "/plugins/");
      expect(entries).toEqual([
        { name: "alpha", trans: ["a"], usphone: "ˈælfə", ukphone: undefined },
        { name: "beta", trans: ["b1", "b2"], usphone: "ˈbiːtə", ukphone: undefined },
      ]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("throws a readable error for a failed request", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("nope", { status: 404 })) as typeof fetch;
    try {
      await expect(
        loadPluginData(meta("missing", "缺失")),
      ).rejects.toThrow(/404/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
