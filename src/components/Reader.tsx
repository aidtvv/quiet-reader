import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { LoadedArticle } from "../types";
import { sentenceAround, wordFromTarget } from "../lib/highlight";
import { translateSentence } from "../lib/onlineDict";

export type WordPick = {
  lemma: string;
  surface: string;
  sentence: string;
};

type ReaderProps = {
  article: LoadedArticle | null;
  html: string;
  zoom: number;
  selectedWord: string | null;
  initialScrollTop?: number;
  searchQuery: string;
  jumpSignal: number;
  onPickWord: (pick: WordPick) => void;
  onScrollTop?: (scrollTop: number) => void;
};

function clearMatches(root: HTMLElement): void {
  const marks = Array.from(root.querySelectorAll("mark.search-hit"));
  if (!marks.length) return;
  for (const mark of marks) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  }
  root.normalize();
}

function markMatches(root: HTMLElement, query: string): void {
  const needle = query.trim().toLowerCase();
  if (!needle) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (
      text.nodeValue &&
      text.parentElement &&
      text.parentElement.tagName !== "MARK"
    ) {
      nodes.push(text);
    }
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    const lower = value.toLowerCase();
    let index = lower.indexOf(needle);
    if (index < 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    while (index >= 0) {
      if (index > cursor) {
        fragment.append(value.slice(cursor, index));
      }
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = value.slice(index, index + needle.length);
      fragment.append(mark);
      cursor = index + needle.length;
      index = lower.indexOf(needle, cursor);
    }
    if (cursor < value.length) fragment.append(value.slice(cursor));
    node.replaceWith(fragment);
  }
}

export function Reader({
  article,
  html,
  zoom,
  selectedWord,
  initialScrollTop = 0,
  searchQuery,
  jumpSignal,
  onPickWord,
  onScrollTop,
}: ReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [selectionBox, setSelectionBox] = useState<{
    text: string;
    translation: string | null;
    loading: boolean;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setSelectionBox(null);
  }, [article?.ref.id]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = initialScrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [article?.ref.href, initialScrollTop]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    clearMatches(body);
    markMatches(body, searchQuery);
  }, [html, searchQuery]);

  useEffect(() => {
    if (!jumpSignal) return;
    bodyRef.current
      ?.querySelector("mark.search-hit")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [jumpSignal]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    for (const span of Array.from(body.querySelectorAll<HTMLElement>(".w"))) {
      span.classList.toggle(
        "selected",
        Boolean(selectedWord) && span.dataset.w === selectedWord,
      );
    }
  }, [html, selectedWord]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;

    if (target.closest("a")) {
      event.preventDefault();
    }

    const lemma = wordFromTarget(target);
    const span = target.closest<HTMLElement>(".w");
    if (lemma && span) {
      onPickWord({
        lemma,
        surface: (span.textContent ?? lemma).trim(),
        sentence: sentenceAround(span),
      });
      return;
    }

    // P1: 正文任意未高亮英文单词也可点击查词
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;

    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let textNode: Node | null = null;
    let offset = 0;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        textNode = range.startContainer;
        offset = range.startOffset;
      }
    } else if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(event.clientX, event.clientY);
      if (pos) {
        textNode = pos.offsetNode;
        offset = pos.offset;
      }
    }
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const text = textNode.textContent ?? "";
    const isWordChar = (ch: string) => /[A-Za-z'’-]/.test(ch);
    let start = Math.min(offset, text.length);
    let end = start;
    while (start > 0 && isWordChar(text[start - 1])) start -= 1;
    while (end < text.length && isWordChar(text[end])) end += 1;
    const raw = text.slice(start, end).replace(/^[’'-]+|[’'-]+$/g, "");
    if (!raw || !/[A-Za-z]{2,}/.test(raw)) return;

    onPickWord({
      lemma: raw.toLowerCase().replace(/[’']s$/, ""),
      surface: raw,
      sentence: sentenceAround(target),
    });
  };

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!text || text.length < 6 || !/\s+/.test(text) || !sel?.rangeCount) {
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const x = Math.min(window.innerWidth - 360, Math.max(16, rect.left));
    const y = Math.min(window.innerHeight - 160, rect.bottom + 10);
    setSelectionBox({ text, translation: null, loading: true, x, y });
    void translateSentence(text).then((translation) => {
      setSelectionBox((cur) =>
        cur && cur.text === text
          ? {
              ...cur,
              translation: translation ?? "暂时无法获取翻译，请检查网络连接。",
              loading: false,
            }
          : cur,
      );
    });
  };

  return (
    <div className="document-area">
      <div
        className="paper-scroll"
        ref={scrollRef}
        onScroll={(event) => onScrollTop?.(event.currentTarget.scrollTop)}
      >
        <article className="paper" style={{ zoom: zoom / 100 }}>
          {article ? (
            <>
              <div className="doc-kicker-row">
                <span className="doc-kicker">
                  {article.ref.sectionTitle.toUpperCase()}
                </span>
              </div>
              <div className="doc-rule" />
              <h1 className="doc-heading">{article.ref.title}</h1>
              {article.rubric ? (
                <p className="doc-subtitle">{article.rubric}</p>
              ) : null}
              <div className="doc-rule" />
              <div
                className="article-body"
                ref={bodyRef}
                onClick={handleClick}
                onMouseUp={handleMouseUp}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          ) : (
            <div className="reader-empty">
              <p>从左侧选择一篇文章开始阅读</p>
            </div>
          )}
        </article>
      </div>
      {selectionBox ? (
        <div
          className="sentence-popover"
          style={{ left: selectionBox.x, top: selectionBox.y }}
          role="dialog"
          aria-label="划句解释"
        >
          <div className="sentence-popover-head">
            <span>划句解释</span>
            <button
              type="button"
              onClick={() => setSelectionBox(null)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <p className="sentence-popover-src">{selectionBox.text}</p>
          <p className="sentence-popover-trans">
            {selectionBox.loading ? "正在翻译…" : selectionBox.translation}
          </p>
        </div>
      ) : null}
    </div>
  );
}
