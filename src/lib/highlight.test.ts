import { describe, expect, it } from "vitest";
import type { PluginMeta } from "../types";
import { buildIndex } from "./dict";
import {
  renderArticleHtml,
  sentenceAround,
  wordFromTarget,
  type HighlightState,
} from "./highlight";

const meta: PluginMeta = {
  id: "kaoyan",
  name: "考研红宝书",
  type: "wordlist",
  wordCount: 6,
  matchableCount: 4,
  source: "test",
  license: "test",
  file: "kaoyan.json",
};

const index = buildIndex(
  [
    {
      meta,
      entries: [
        { name: "company", trans: ["公司"] },
        { name: "sustain", trans: ["维持"] },
        { name: "according to", trans: ["根据"] },
        { name: "perceive", trans: ["察觉"] },
      ],
    },
  ],
  {
    companies: "company",
    sustaining: "sustain",
    perceived: "perceive",
  },
);

function state(overrides: Partial<HighlightState> = {}): HighlightState {
  return { index, known: new Set(), saved: new Set(), ...overrides };
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("renderArticleHtml", () => {
  it("wraps inflected words with their lemma", () => {
    const html = renderArticleHtml(
      "<p>Companies are sustaining growth.</p>",
      state(),
    );
    const document = parse(html);
    const spans = Array.from(document.querySelectorAll("span.w"));

    expect(spans.map((span) => span.getAttribute("data-w"))).toEqual([
      "company",
      "sustain",
    ]);
    expect(spans.map((span) => span.textContent)).toEqual([
      "Companies",
      "sustaining",
    ]);
    expect(spans[0].className).toBe("w hit");
  });

  it("matches a phrase as one span and leaves the comma outside", () => {
    const html = renderArticleHtml("<p>according to, they say.</p>", state());
    const document = parse(html);
    const span = document.querySelector("span.w");

    expect(span?.className).toBe("w phrase hit");
    expect(span?.getAttribute("data-w")).toBe("according to");
    expect(span?.textContent).toBe("according to");
    expect(span?.nextSibling?.textContent).toBe(", they say.");
  });

  it("keeps the displayed apostrophe while matching the lemma", () => {
    const html = renderArticleHtml("<p>The company's office.</p>", state());
    const span = parse(html).querySelector("span.w");

    expect(span?.getAttribute("data-w")).toBe("company");
    expect(span?.textContent).toBe("company's");
  });

  it("removes scripts and preserves entities", () => {
    const html = renderArticleHtml(
      '<p>growth &amp; hiring</p><script>alert("x")</script>',
      state(),
    );

    expect(html).not.toContain("<script");
    expect(html).toContain("&amp; hiring");
  });

  it("drops unknown attributes and unwraps unknown tags", () => {
    const html = renderArticleHtml(
      '<div onclick="bad()"><p style="color:red">plain <font>text</font></p></div>',
      state(),
    );

    expect(html).not.toContain("onclick");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("<font");
    expect(html).toContain("plain text");
  });

  it("marks known words without hit and keeps the saved badge", () => {
    const html = renderArticleHtml(
      "<p>Companies sustain growth.</p>",
      state({
        known: new Set(["company"]),
        saved: new Set(["company", "sustain"]),
      }),
    );
    const document = parse(html);
    const company = document.querySelector('[data-w="company"]');
    const sustain = document.querySelector('[data-w="sustain"]');

    expect(company?.className).toBe("w saved");
    expect(sustain?.className).toBe("w saved hit");
  });
});

describe("sentenceAround", () => {
  it("returns the sentence containing the clicked word", () => {
    const document = parse(
      "<p>First sentence here. Companies are sustaining growth. Third one.</p>",
    );
    const container = document.createElement("div");
    container.innerHTML = renderArticleHtml(
      document.body.innerHTML,
      state(),
    );
    const span = container.querySelector('[data-w="company"]');
    expect(span).not.toBeNull();
    expect(sentenceAround(span as Element)).toBe(
      "Companies are sustaining growth.",
    );
  });
});

describe("wordFromTarget", () => {
  it("finds the lemma on the clicked span and its children", () => {
    const document = parse(
      renderArticleHtml("<p>Companies grow.</p>", state()),
    );
    const span = document.querySelector('[data-w="company"]') as Element;
    expect(wordFromTarget(span)).toBe("company");
    expect(wordFromTarget(span.querySelector("*") ?? span)).toBe("company");
    expect(wordFromTarget(document.querySelector("p") as Element)).toBeNull();
  });
});
