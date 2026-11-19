import JSZip from "jszip";
import type {
  ArticleRef,
  BookSection,
  LoadedArticle,
  ParsedBook,
} from "../types";

export type EpubSectionIndex = {
  title: string;
  articles: { href: string; title: string }[];
};

export type ArticleText = {
  ref: ArticleRef;
  plainText: string;
  excerpt: string;
};

export type EpubSource = {
  book: ParsedBook;
  loadSection(href: string): Promise<EpubSectionIndex>;
  loadArticle(href: string): Promise<LoadedArticle>;
  loadArticleText(href: string): Promise<ArticleText>;
  close(): void;
};

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
};

const HTML_TYPES = new Set([
  "application/xhtml+xml",
  "text/html",
  "application/x-dtbook+xml",
]);

function elements(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}

function firstElement(root: Document | Element, name: string): Element | null {
  return elements(root, name)[0] ?? null;
}

function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function resolvePath(baseDir: string, href: string): string {
  const clean = decodeURIComponent(href.split("#")[0] ?? "");
  if (!clean) return "";
  if (/^[a-z]+:/i.test(clean)) return clean;
  const parts = `${baseDir}/${clean}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function parseMarkup(text: string, kind: "xml" | "html" = "html"): Document {
  const document = new DOMParser().parseFromString(
    text,
    kind === "xml" ? "application/xml" : "text/html",
  );
  if (kind === "xml" && document.querySelector("parsererror")) {
    throw new Error("XML 解析失败");
  }
  return document;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slug(text: string, fallback: string): string {
  const value = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return value || fallback;
}

function issueDateFrom(title: string): string | undefined {
  const dotted = title.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (dotted) {
    return `${dotted[1]}-${dotted[2].padStart(2, "0")}-${dotted[3].padStart(2, "0")}`;
  }
  const named = title.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/,
  );
  if (named) {
    const date = new Date(`${named[1]} ${named[2]}, ${named[3]}`);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

export async function hashBytes(data: ArrayBuffer): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fall through to the cheap deterministic hash.
  }

  let hash = 0x811c9dc5;
  for (const byte of new Uint8Array(data)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  return file.async("string");
}

function makeRef(
  href: string,
  title: string,
  sectionId: string,
  sectionTitle: string,
): ArticleRef {
  return { id: href, href, title: normalizeWhitespace(title), sectionId, sectionTitle };
}

function tocSectionsFromLinks(
  links: { href: string; title: string }[],
  sectionTitle: string,
): BookSection[] {
  if (!links.length) return [];
  const id = slug(sectionTitle, "contents");
  return [
    {
      id,
      title: sectionTitle,
      articles: links.map((link) =>
        makeRef(link.href, link.title, id, sectionTitle),
      ),
    },
  ];
}

async function parseEconomistToc(
  zip: JSZip,
  items: ManifestItem[],
): Promise<BookSection[] | null> {
  const htmlItems = items.filter(
    (item) => HTML_TYPES.has(item.mediaType) || /\.x?html?$/i.test(item.href),
  );
  const candidates = [
    ...htmlItems.filter((item) => /book_toc\.html?$/i.test(item.href)),
    ...htmlItems.filter((item) => !/book_toc\.html?$/i.test(item.href)).slice(0, 20),
  ];

  for (const item of candidates) {
    const text = await readText(zip, item.href);
    if (!text || !text.includes("sec_toc_item")) continue;

    const document = parseMarkup(text);
    const sectionLinks = Array.from(
      document.querySelectorAll("a.sec_toc_item"),
    );
    if (!sectionLinks.length) continue;

    const sections: BookSection[] = [];
    for (const anchor of sectionLinks) {
      const href = resolvePath(dirOf(item.href), anchor.getAttribute("href") ?? "");
      const sectionTitle = normalizeWhitespace(anchor.textContent ?? "");
      const sectionText = await readText(zip, href);
      let articles: { href: string; title: string }[] = [];
      let resolvedTitle = sectionTitle;

      if (sectionText) {
        const sectionDocument = parseMarkup(sectionText);
        const heading = sectionDocument.querySelector(".section_index_title");
        if (heading?.textContent?.trim()) {
          resolvedTitle = normalizeWhitespace(heading.textContent);
        }
        articles = Array.from(
          sectionDocument.querySelectorAll("li.sec_index_li a"),
        )
          .map((link) => ({
            href: resolvePath(dirOf(href), link.getAttribute("href") ?? ""),
            title: normalizeWhitespace(link.textContent ?? ""),
          }))
          .filter((link) => link.href);
      }

      if (!articles.length) {
        articles = [{ href, title: resolvedTitle }];
      }

      const id = slug(resolvedTitle, `section-${sections.length + 1}`);
      sections.push({
        id,
        title: resolvedTitle,
        href,
        articles: articles.map((article) =>
          makeRef(article.href, article.title, id, resolvedTitle),
        ),
      });
    }

    if (sections.length) return sections;
  }

  return null;
}

function labelOf(element: Element): string {
  for (const child of Array.from(element.children)) {
    if (child.tagName === "OL") continue;
    const text = normalizeWhitespace(child.textContent ?? "");
    if (text) return text;
  }
  const link = element.querySelector("a");
  return normalizeWhitespace(link?.textContent ?? element.textContent ?? "");
}

function directListItems(list: Element): Element[] {
  return Array.from(list.children).filter((child) => child.tagName === "LI");
}

function nestedLinksOf(item: Element): Element[] {
  const nestedList = Array.from(item.children).find(
    (child) => child.tagName === "OL",
  );
  return nestedList ? Array.from(nestedList.querySelectorAll("a")) : [];
}

async function parseNavToc(
  zip: JSZip,
  items: ManifestItem[],
): Promise<BookSection[] | null> {
  const nav = items.find((item) => item.properties.includes("nav"));
  if (!nav) return null;

  const text = await readText(zip, nav.href);
  if (!text) return null;
  const document = parseMarkup(text);
  const navElement = document.querySelector("nav");
  if (!navElement) return null;

  const sections: BookSection[] = [];
  const flatLinks: { href: string; title: string }[] = [];
  const firstList = navElement.querySelector("ol");
  const topItems = firstList ? directListItems(firstList) : [];

  for (const item of topItems) {
    const nestedLinks = nestedLinksOf(item);
    if (nestedLinks.length) {
      const sectionTitle = labelOf(item);
      const id = slug(sectionTitle, `section-${sections.length + 1}`);
      sections.push({
        id,
        title: sectionTitle,
        articles: nestedLinks.map((link) =>
          makeRef(
            resolvePath(dirOf(nav.href), link.getAttribute("href") ?? ""),
            link.textContent ?? "",
            id,
            sectionTitle,
          ),
        ),
      });
    } else {
      const link = item.querySelector("a");
      if (link) {
        flatLinks.push({
          href: resolvePath(dirOf(nav.href), link.getAttribute("href") ?? ""),
          title: normalizeWhitespace(link.textContent ?? ""),
        });
      }
    }
  }

  if (!sections.length && flatLinks.length) {
    return tocSectionsFromLinks(flatLinks, "目录");
  }
  return sections.length ? sections : null;
}

async function parseNcxToc(
  zip: JSZip,
  items: ManifestItem[],
): Promise<BookSection[] | null> {
  const ncx = items.find(
    (item) => item.mediaType === "application/x-dtbncx+xml",
  );
  if (!ncx) return null;

  const text = await readText(zip, ncx.href);
  if (!text) return null;
  let document: Document;
  try {
    document = parseMarkup(text, "xml");
  } catch {
    return null;
  }
  const navMap = firstElement(document, "navMap");
  if (!navMap) return null;

  const sections: BookSection[] = [];
  const topPoints = elements(navMap, "navPoint").filter(
    (point) => point.parentElement?.nodeName.endsWith("navMap"),
  );

  const linkOf = (point: Element) => {
    const content = firstElement(point, "content");
    const label = firstElement(point, "navLabel")?.textContent ?? "";
    return {
      href: resolvePath(
        dirOf(ncx.href),
        content?.getAttribute("src") ?? "",
      ),
      title: normalizeWhitespace(label),
    };
  };

  const flat: { href: string; title: string }[] = [];
  for (const point of topPoints) {
    const children = elements(point, "navPoint");
    if (children.length) {
      const sectionTitle = linkOf(point).title || `Section ${sections.length + 1}`;
      const id = slug(sectionTitle, `section-${sections.length + 1}`);
      sections.push({
        id,
        title: sectionTitle,
        articles: children
          .map(linkOf)
          .filter((link) => link.href)
          .map((link) => makeRef(link.href, link.title, id, sectionTitle)),
      });
    } else {
      const link = linkOf(point);
      if (link.href) flat.push(link);
    }
  }

  if (!sections.length && flat.length) {
    return tocSectionsFromLinks(flat, "目录");
  }
  return sections.length ? sections : null;
}

async function parseSpine(
  opf: Document,
  items: ManifestItem[],
  title: string,
): Promise<BookSection[]> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const order = elements(opf, "itemref")
    .map((itemref) => byId.get(itemref.getAttribute("idref") ?? ""))
    .filter(
      (item): item is ManifestItem =>
        item !== undefined && HTML_TYPES.has(item.mediaType),
    );

  const articles = order.map((item) =>
    makeRef(item.href, item.href.split("/").pop() ?? item.href, "spine", title),
  );

  return [
    {
      id: "spine",
      title: title || "正文",
      articles,
    },
  ];
}

export async function openEpub(
  data: ArrayBuffer,
  fileName: string,
): Promise<EpubSource> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("无法读取 epub：文件不是有效的 zip 包");
  }

  const containerText = await readText(zip, "META-INF/container.xml");
  if (!containerText) {
    throw new Error("无法读取 epub：缺少 META-INF/container.xml");
  }

  let container: Document;
  try {
    container = parseMarkup(containerText, "xml");
  } catch {
    throw new Error("无法读取 epub：container.xml 格式错误");
  }

  const rootfile = firstElement(container, "rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) {
    throw new Error("无法读取 epub：container.xml 没有 rootfile");
  }

  const opfText = await readText(zip, opfPath);
  if (!opfText) {
    throw new Error(`无法读取 epub：找不到 ${opfPath}`);
  }

  let opf: Document;
  try {
    opf = parseMarkup(opfText, "xml");
  } catch {
    throw new Error("无法读取 epub：OPF 格式错误");
  }

  const opfDir = dirOf(opfPath);
  const items: ManifestItem[] = elements(opf, "item").map((item) => ({
    id: item.getAttribute("id") ?? "",
    href: resolvePath(opfDir, item.getAttribute("href") ?? ""),
    mediaType: item.getAttribute("media-type") ?? "",
    properties: item.getAttribute("properties") ?? "",
  }));

  const title =
    normalizeWhitespace(firstElement(opf, "title")?.textContent ?? "") ||
    fileName.replace(/\.epub$/i, "");
  const issueDate = issueDateFrom(title);

  const sections =
    (await parseEconomistToc(zip, items)) ??
    (await parseNavToc(zip, items)) ??
    (await parseNcxToc(zip, items)) ??
    (await parseSpine(opf, items, title));

  const bookId = await hashBytes(data);
  const book: ParsedBook = { bookId, title, issueDate, sections };
  const refs = new Map<string, ArticleRef>();
  for (const section of sections) {
    for (const article of section.articles) {
      if (!refs.has(article.href)) refs.set(article.href, article);
    }
  }

  const imageUrls = new Map<string, string>();
  const articleCache = new Map<string, LoadedArticle>();
  const textCache = new Map<string, ArticleText>();

  function excerptOf(plainText: string): string {
    return plainText.length > 80
      ? `${plainText.slice(0, 80).replace(/\s+\S*$/, "")}…`
      : plainText;
  }

  async function loadArticleText(href: string): Promise<ArticleText> {
    const cached = textCache.get(href);
    if (cached) return cached;

    const text = await readText(zip, href);
    if (!text) throw new Error(`无法读取文章：${href}`);

    const document = parseMarkup(text);
    for (const node of Array.from(
      document.querySelectorAll("script,style,link,iframe,object,embed"),
    )) {
      node.remove();
    }

    const body = document.body;
    if (!body) throw new Error(`文章没有正文：${href}`);

    const headingText = normalizeWhitespace(
      body.querySelector("h1.te_article_title, h1")?.textContent ?? "",
    );
    const plainText = normalizeWhitespace(body.textContent ?? "");
    const ref =
      refs.get(href) ??
      makeRef(href, headingText || document.title || href, "unknown", "");

    const result: ArticleText = {
      ref: { ...ref, title: headingText || ref.title },
      plainText,
      excerpt: excerptOf(plainText),
    };
    textCache.set(href, result);
    return result;
  }

  async function imageUrl(path: string): Promise<string | null> {
    const cached = imageUrls.get(path);
    if (cached) return cached;
    const file = zip.file(path);
    if (!file) return null;
    const blob = await file.async("blob");
    if (typeof URL.createObjectURL !== "function") return null;
    const url = URL.createObjectURL(blob);
    imageUrls.set(path, url);
    return url;
  }

  async function loadSection(href: string): Promise<EpubSectionIndex> {
    const text = await readText(zip, href);
    if (!text) return { title: "", articles: [] };
    const document = parseMarkup(text);
    const sectionTitle = normalizeWhitespace(
      document.querySelector(".section_index_title")?.textContent ??
        document.title ??
        "",
    );
    const articles = Array.from(
      document.querySelectorAll("li.sec_index_li a"),
    ).map((link) => ({
      href: resolvePath(dirOf(href), link.getAttribute("href") ?? ""),
      title: normalizeWhitespace(link.textContent ?? ""),
    }));
    return { title: sectionTitle, articles };
  }

  async function loadArticle(href: string): Promise<LoadedArticle> {
    const cached = articleCache.get(href);
    if (cached) return cached;

    const text = await readText(zip, href);
    if (!text) throw new Error(`无法读取文章：${href}`);

    const document = parseMarkup(text);
    for (const node of Array.from(
      document.querySelectorAll("script,style,link,iframe,object,embed"),
    )) {
      node.remove();
    }

    const body = document.body;
    if (!body) throw new Error(`文章没有正文：${href}`);

    const heading =
      body.querySelector("h1.te_article_title") ?? body.querySelector("h1");
    const headingText = normalizeWhitespace(heading?.textContent ?? "");
    heading?.remove();

    const rubricElement = body.querySelector(".te_article_rubric");
    const rubric = normalizeWhitespace(rubricElement?.textContent ?? "");
    rubricElement?.remove();
    body.querySelector(".te_section_title")?.remove();
    body.querySelector(".te_article_datePublished")?.remove();

    for (const image of Array.from(body.querySelectorAll("img"))) {
      const src = image.getAttribute("src") ?? "";
      if (!src || /^(https?:|data:|blob:)/i.test(src)) continue;
      const resolved = resolvePath(dirOf(href), src);
      const url = await imageUrl(resolved);
      if (url) image.setAttribute("src", url);
      else image.remove();
    }

    const plainText = normalizeWhitespace(body.textContent ?? "");
    const excerpt = excerptOf(plainText);

    const ref =
      refs.get(href) ??
      makeRef(href, headingText || document.title || href, "unknown", "");

    const article: LoadedArticle = {
      ref: { ...ref, title: headingText || ref.title },
      html: body.innerHTML,
      plainText,
      excerpt,
      images: Object.fromEntries(imageUrls),
      rubric: rubric || undefined,
    };

    articleCache.set(href, article);
    return article;
  }

  return {
    book,
    loadSection,
    loadArticle,
    loadArticleText,
    close() {
      textCache.clear();
      for (const url of imageUrls.values()) {
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(url);
        }
      }
      imageUrls.clear();
      articleCache.clear();
    },
  };
}
