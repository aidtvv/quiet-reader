import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { hashBytes, openEpub } from "./epub";

async function buildFixture(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Test Issue</dc:title>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
        <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
        <item id="pic" href="pic.png" media-type="image/png"/>
      </manifest>
      <spine>
        <itemref idref="ch1"/>
        <itemref idref="ch2"/>
      </spine>
    </package>`,
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops">
          <ol>
            <li>
              <span>Business</span>
              <ol>
                <li><a href="ch1.xhtml">First story</a></li>
                <li><a href="ch2.xhtml">Second story</a></li>
              </ol>
            </li>
          </ol>
        </nav>
      </body>
    </html>`,
  );
  zip.file(
    "OEBPS/ch1.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>First story</title></head>
      <body>
        <h1>First story</h1>
        <p>Companies are sustaining growth &amp; hiring.</p>
        <script>alert("x")</script>
        <p><img src="pic.png" alt="chart"/></p>
      </body>
    </html>`,
  );
  zip.file(
    "OEBPS/ch2.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>Second story</title></head>
      <body><h1>Second story</h1><p>Another article.</p></body>
    </html>`,
  );
  zip.file("OEBPS/pic.png", new Uint8Array([137, 80, 78, 71]));
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("openEpub", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("reads title, sections and articles", async () => {
    const source = await openEpub(await buildFixture(), "test.epub");

    expect(source.book.title).toBe("Test Issue");
    expect(source.book.sections).toHaveLength(1);
    expect(source.book.sections[0].title).toBe("Business");
    expect(source.book.sections[0].articles.map((item) => item.title)).toEqual(
      ["First story", "Second story"],
    );
  });

  it("loads an article without scripts and rewrites images", async () => {
    const source = await openEpub(await buildFixture(), "test.epub");
    const href = source.book.sections[0].articles[0].href;
    const article = await source.loadArticle(href);

    expect(article.html).not.toContain("<script");
    expect(article.html).toContain("Companies are sustaining growth &amp; hiring.");
    expect(article.html).toContain('src="blob:mock"');
    expect(article.plainText).toContain("Companies are sustaining growth");
    expect(article.excerpt.length).toBeGreaterThan(10);
  });

  it("rejects data that is not an epub", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "not a book");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });

    await expect(openEpub(bytes, "bad.epub")).rejects.toThrow(/epub/i);
  });
});

describe("hashBytes", () => {
  it("is stable for the same bytes and differs for different bytes", async () => {
    const a = new TextEncoder().encode("same").buffer;
    const b = new TextEncoder().encode("other").buffer;

    expect(await hashBytes(a)).toBe(await hashBytes(a));
    expect(await hashBytes(a)).not.toBe(await hashBytes(b));
  });
});
