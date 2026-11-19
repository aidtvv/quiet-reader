import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openEpub } from "../src/lib/epub";

const EPUB_PATH = "D:\\Downloads\\TheEconomist.2026.11.14.epub";
const hasEpub = existsSync(EPUB_PATH);

describe.skipIf(!hasEpub)("The Economist sample epub", () => {
  it("parses 19 sections and 76 articles", async () => {
    const bytes = readFileSync(EPUB_PATH);
    const data = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const source = await openEpub(data as ArrayBuffer, "TheEconomist.2026.11.14.epub");

    expect(source.book.sections.length).toBe(19);
    const articles = source.book.sections.flatMap((section) => section.articles);
    expect(articles.length).toBe(76);
    expect(source.book.issueDate).toBe("2026-11-14");

    const article = await source.loadArticle(articles[0].href);
    expect(article.plainText.length).toBeGreaterThan(200);
    expect(article.html).not.toContain("<script");
    source.close();
  }, 30_000);
});
