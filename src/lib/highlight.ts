import type { DictEntry } from "../types";
import { lookup, tokenizeWords, type DictIndex, type WordToken } from "./dict";

export type HighlightState = {
  index: DictIndex;
  known: Set<string>;
  saved: Set<string>;
  /** 基础词（A1–A2）词元；命中时不再标注，避免 the / of / be 之类刷屏。 */
  basic?: Set<string>;
};

const ALLOWED_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "IMG",
  "BLOCKQUOTE",
  "HR",
  "UL",
  "OL",
  "LI",
  "EM",
  "STRONG",
  "I",
  "B",
  "A",
  "BR",
]);

const DROPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "FORM",
  "INPUT",
  "BUTTON",
  "SVG",
  "VIDEO",
  "AUDIO",
  "CANVAS",
  "NOSCRIPT",
]);

const KEPT_ATTRIBUTES = new Set(["href", "src", "alt", "class"]);

const BLOCK_SELECTOR = "p, li, blockquote";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanDocument(root: Element): void {
  for (const node of Array.from(root.querySelectorAll("*"))) {
    if (DROPPED_TAGS.has(node.tagName)) {
      node.remove();
    }
  }

  const elements = Array.from(root.querySelectorAll("*")).reverse();
  for (const element of elements) {
    if (element.tagName === "SPAN" && element.classList.contains("w")) continue;
    for (const attribute of Array.from(element.attributes)) {
      if (!KEPT_ATTRIBUTES.has(attribute.name.toLowerCase())) {
        element.removeAttribute(attribute.name);
      }
    }
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
    }
  }

  for (const comment of Array.from(root.childNodes)) {
    if (comment.nodeType === 8) comment.remove();
  }
}

/** 基础词默认不标注，但已加入生词本的词仍然保留，方便回看。 */
function hiddenBasic(state: HighlightState, lemma: string): boolean {
  return Boolean(state.basic?.has(lemma)) && !state.saved.has(lemma);
}

function spanHtml(
  display: string,
  hit: DictEntry,
  state: HighlightState,
  isPhrase: boolean,
): string {
  const classes = ["w"];
  if (isPhrase) classes.push("phrase");
  if (state.saved.has(hit.lemma)) classes.push("saved");
  if (!state.known.has(hit.lemma)) classes.push("hit");

  return `<span class="${classes.join(" ")}" data-w="${escapeHtml(hit.lemma)}" data-lists="${escapeHtml(hit.lists.join(","))}">${escapeHtml(display)}</span>`;
}

function phraseAt(
  state: HighlightState,
  tokens: WordToken[],
  start: number,
): { entry: DictEntry; size: number } | null {
  const limit = Math.min(state.index.maxPhraseTokens, tokens.length - start);
  for (let size = limit; size >= 2; size--) {
    const candidate = tokens
      .slice(start, start + size)
      .map((token) => token.lower)
      .join(" ");
    const hit = state.index.phrases.get(candidate);
    if (hit) return { entry: hit, size };
  }
  return null;
}

function highlightTextNode(
  node: Text,
  state: HighlightState,
): void {
  const text = node.nodeValue ?? "";
  if (!text.trim()) return;

  const tokens = tokenizeWords(text);
  if (!tokens.length) return;

  const fragment = node.ownerDocument.createDocumentFragment();
  let cursor = 0;

  for (let i = 0; i < tokens.length; ) {
    const phrase = phraseAt(state, tokens, i);
    if (phrase && !hiddenBasic(state, phrase.entry.lemma)) {
      const start = tokens[i].start;
      const end = tokens[i + phrase.size - 1].end;
      if (start > cursor) {
        fragment.append(
          node.ownerDocument.createTextNode(text.slice(cursor, start)),
        );
      }
      fragment.append(
        fragmentFromHtml(
          spanHtml(text.slice(start, end), phrase.entry, state, true),
          node.ownerDocument,
        ),
      );
      cursor = end;
      i += phrase.size;
      continue;
    }

    const token = tokens[i];
    const hit = lookup(state.index, token.lower);
    if (hit && !hiddenBasic(state, hit.lemma)) {
      if (token.start > cursor) {
        fragment.append(
          node.ownerDocument.createTextNode(text.slice(cursor, token.start)),
        );
      }
      fragment.append(
        fragmentFromHtml(
          spanHtml(text.slice(token.start, token.end), hit, state, false),
          node.ownerDocument,
        ),
      );
      cursor = token.end;
    }
    i += 1;
  }

  if (cursor < text.length) {
    fragment.append(node.ownerDocument.createTextNode(text.slice(cursor)));
  }

  if (fragment.childNodes.length) node.replaceWith(fragment);
}

function fragmentFromHtml(html: string, document: Document): Node {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.cloneNode(true);
}

export function renderArticleHtml(
  rawHtml: string,
  state: HighlightState,
): string {
  const document = new DOMParser().parseFromString(rawHtml, "text/html");
  const root = document.body;
  if (!root) return "";

  cleanDocument(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (text.parentElement?.closest(BLOCK_SELECTOR)) {
      textNodes.push(text);
    }
    current = walker.nextNode();
  }

  for (const node of textNodes) highlightTextNode(node, state);
  return root.innerHTML;
}

export function sentenceAround(node: Element): string {
  const block =
    node.closest(BLOCK_SELECTOR) ?? node.closest("div") ?? node.parentElement;
  if (!block) return "";

  const text = (block.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const word = (node.textContent ?? "").trim();
  const position = word ? text.indexOf(word) : -1;
  if (position < 0) return text;

  const boundaries = [0];
  const pattern = /[.!?。！？]["'’”)]?\s+/g;
  for (const match of text.matchAll(pattern)) {
    boundaries.push((match.index ?? 0) + match[0].length);
  }
  boundaries.push(text.length);

  let start = 0;
  let end = text.length;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (boundaries[i] <= position && position < boundaries[i + 1]) {
      start = boundaries[i];
      end = boundaries[i + 1];
      break;
    }
  }

  return text.slice(start, end).trim();
}

export function wordFromTarget(target: Element): string | null {
  const span = target.closest(".w");
  const lemma = span?.getAttribute("data-w");
  return lemma && lemma.trim() ? lemma : null;
}
