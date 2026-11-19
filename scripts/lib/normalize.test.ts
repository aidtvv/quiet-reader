import { describe, expect, it } from "vitest";
import {
  expandHeadword,
  normalizeEntries,
  parseLemmaFile,
} from "./normalize.mjs";

describe("expandHeadword", () => {
  it("expands parenthesised variants", () => {
    expect(expandHeadword("enrol(l)")).toEqual(["enrol", "enroll"]);
    expect(expandHeadword("among(st)")).toEqual(["among", "amongst"]);
  });

  it("splits slash variants", () => {
    expect(expandHeadword("honour/honor")).toEqual(["honour", "honor"]);
    expect(expandHeadword("a/an")).toEqual(["a", "an"]);
  });

  it("keeps phrases and deduplicates", () => {
    expect(expandHeadword("according to")).toEqual(["according to"]);
    expect(expandHeadword("word/word")).toEqual(["word"]);
  });
});

describe("normalizeEntries", () => {
  it("merges case-insensitive duplicates and keeps the first spelling", () => {
    const entries = normalizeEntries([
      { name: "Word", trans: ["n. 单词"] },
      { name: "word", trans: ["n. 词"], usphone: "wɜːd" },
      { name: "enrol(l)", trans: ["v. 注册"] },
    ]);

    expect(entries.map((entry) => entry.name)).toEqual([
      "Word",
      "enrol",
      "enroll",
    ]);
    expect(entries[0].trans).toEqual(["n. 单词", "n. 词"]);
    expect(entries[0].usphone).toBe("wɜːd");
  });
});

describe("parseLemmaFile", () => {
  const heads = new Set(["perceive", "he", "give", "study", "they"]);

  it("maps inflections to their lemma", () => {
    const map = parseLemmaFile(
      [
        "; En Lemma Database",
        "perceive/2903 -> perceived,perceiving,perceives",
        "study/41394 -> studies,studied,studying",
      ].join("\n"),
      heads,
    );

    expect(map.perceived).toBe("perceive");
    expect(map.studies).toBe("study");
  });

  it("never rewrites a word that is itself a headword", () => {
    const map = parseLemmaFile("he/1196022 -> his,him,they", heads);
    expect(map.his).toBe("he");
    expect(map.they).toBeUndefined();
  });

  it("ignores lemmas that are not in the word list", () => {
    const map = parseLemmaFile("unknown/10 -> unknowns", heads);
    expect(map).toEqual({});
  });

  it("prefers the more frequent lemma when a variant is shared", () => {
    const map = parseLemmaFile(
      ["perceive/10 -> saw", "see/100 -> saw"].join("\n"),
      new Set(["perceive", "see"]),
    );
    expect(map.saw).toBe("see");
  });
});
