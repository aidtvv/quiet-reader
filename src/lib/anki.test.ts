import { describe, expect, it } from "vitest";
import type { WordEntry } from "../types";
import { ankiFileName, sourceOf, toAnkiTsv } from "./anki";

function word(overrides: Partial<WordEntry> = {}): WordEntry {
  return {
    lemma: "sustain",
    surface: "sustaining",
    phonetic: "səˈsteɪn",
    trans: ["v. 维持，保持", "v. 支撑"],
    lists: ["kaoyan"],
    sentence: "Companies are sustaining growth.",
    bookId: "abc",
    bookTitle: "TheEconomist.2026.11.14",
    section: "Business",
    articleId: "article.xhtml",
    articleTitle: "The next boom",
    addedAt: new Date(2026, 10, 19, 8, 5).getTime(),
    ...overrides,
  };
}

describe("toAnkiTsv", () => {
  it("starts with the exact header and no BOM", () => {
    const tsv = toAnkiTsv([]);
    expect(tsv.startsWith("﻿")).toBe(false);
    expect(tsv.split("\n")[0]).toBe(
      "Word\tPhonetic\tMeaning\tContext\tSource\tAdded",
    );
  });

  it("joins translations with <br> and builds the source label", () => {
    const row = toAnkiTsv([word()]).split("\n")[1].split("\t");

    expect(row[0]).toBe("sustain");
    expect(row[1]).toBe("səˈsteɪn");
    expect(row[2]).toBe("v. 维持，保持<br>v. 支撑");
    expect(row[3]).toBe("Companies are sustaining growth.");
    expect(row[4]).toBe("TheEconomist.2026.11.14 · Business · The next boom");
    expect(row[5]).toBe("2026-11-19 08:05");
  });

  it("replaces tabs and newlines inside fields with spaces", () => {
    const row = toAnkiTsv([
      word({
        trans: ["a\tb", "c\nd"],
        sentence: "line one\nline two\tend",
        lemma: "tab\tword",
      }),
    ])
      .split("\n")[1]
      .split("\t");

    expect(row).toHaveLength(6);
    expect(row[0]).toBe("tab word");
    expect(row[2]).toBe("a b<br>c d");
    expect(row[3]).toBe("line one line two end");
  });

  it("leaves missing optional fields empty", () => {
    const row = toAnkiTsv([
      word({
        phonetic: undefined,
        sentence: undefined,
        section: undefined,
        articleTitle: undefined,
      }),
    ])
      .split("\n")[1]
      .split("\t");

    expect(row).toHaveLength(6);
    expect(row[1]).toBe("");
    expect(row[3]).toBe("");
    expect(row[4]).toBe("TheEconomist.2026.11.14");
  });
});

describe("sourceOf", () => {
  it("skips blank parts", () => {
    expect(sourceOf(word({ section: " ", articleTitle: "" }))).toBe(
      "TheEconomist.2026.11.14",
    );
  });
});

describe("ankiFileName", () => {
  it("uses the local date", () => {
    expect(ankiFileName(new Date(2026, 0, 2, 23, 0).getTime())).toBe(
      "quiet-reader-anki-2026-01-02.tsv",
    );
  });
});
