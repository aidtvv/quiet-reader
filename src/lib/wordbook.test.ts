import { describe, expect, it } from "vitest";
import type { WordEntry } from "../types";
import {
  addWord,
  dayKey,
  groupByDay,
  removeWord,
  toggleKnown,
} from "./wordbook";

function entry(lemma: string, addedAt: number, sentence = "ctx"): WordEntry {
  return {
    lemma,
    surface: lemma,
    trans: ["释义"],
    lists: ["kaoyan-hongbaoshu-2025"],
    sentence,
    addedAt,
  };
}

const NOW = new Date(2026, 10, 19, 20, 0).getTime();

describe("groupByDay", () => {
  it("groups same-day words together and sorts newest first", () => {
    const morning = new Date(2026, 10, 19, 9, 0).getTime();
    const evening = new Date(2026, 10, 19, 18, 0).getTime();
    const groups = groupByDay(
      [entry("a", morning), entry("b", evening)],
      NOW,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("今天");
    expect(groups[0].entries.map((item) => item.lemma)).toEqual(["b", "a"]);
  });

  it("splits across local midnight and labels yesterday", () => {
    const yesterday = new Date(2026, 10, 18, 23, 30).getTime();
    const groups = groupByDay(
      [entry("today", NOW), entry("old", yesterday)],
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual(["今天", "昨天"]);
  });

  it("uses the date key for older entries", () => {
    const older = new Date(2026, 10, 1, 8, 0).getTime();
    const groups = groupByDay([entry("x", older)], NOW);
    expect(groups[0].label).toBe("2026-11-01");
  });
});

describe("addWord", () => {
  it("is idempotent and preserves the original date", () => {
    const first = addWord({}, entry("perceive", 1000, "first"));
    const second = addWord(first, {
      ...entry("perceive", 5000, "second"),
      trans: ["新释义"],
    });

    expect(Object.keys(second)).toEqual(["perceive"]);
    expect(second.perceive.addedAt).toBe(1000);
    expect(second.perceive.sentence).toBe("second");
    expect(second.perceive.trans).toEqual(["新释义"]);
  });

  it("keeps existing translations when the update has none", () => {
    const first = addWord({}, entry("give", 1000));
    const second = addWord(first, { ...entry("give", 2000), trans: [] });
    expect(second.give.trans).toEqual(["释义"]);
  });
});

describe("removeWord and toggleKnown", () => {
  it("removes a word without mutating the input", () => {
    const source = addWord({}, entry("take", 1));
    const next = removeWord(source, "take");
    expect(Object.keys(next)).toHaveLength(0);
    expect(Object.keys(source)).toEqual(["take"]);
  });

  it("toggles known state both ways", () => {
    const on = toggleKnown(new Set<string>(), "company");
    expect(on.has("company")).toBe(true);
    const off = toggleKnown(on, "company");
    expect(off.has("company")).toBe(false);
    expect(on.has("company")).toBe(true);
  });

  it("builds local date keys", () => {
    expect(dayKey(new Date(2026, 0, 2, 23, 59).getTime())).toBe("2026-01-02");
  });
});
