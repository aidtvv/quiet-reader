import { useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Download,
  ListTree,
  PanelLeftClose,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import type {
  ArticleIndexEntry,
  ArticleRef,
  Bookmark as BookmarkType,
  BookSection,
  NavTab,
  ParsedBook,
  WordEntry,
} from "../types";
import { groupByDay, dayLabel } from "../lib/wordbook";

type OutlinePanelProps = {
  tab: NavTab;
  onTab: (tab: NavTab) => void;
  query: string;
  onQuery: (value: string) => void;
  book: ParsedBook | null;
  currentHref: string | null;
  onOpenArticle: (ref: ArticleRef) => void;
  articleIndex: Map<string, ArticleIndexEntry>;
  indexing: { done: number; total: number };
  wordbook: Record<string, WordEntry>;
  known: Set<string>;
  onSelectWord: (lemma: string) => void;
  onRemoveWords: (lemmas: string[]) => void;
  onRestoreKnown: (lemma: string) => void;
  bookmarks: BookmarkType[];
  canBookmark: boolean;
  onAddBookmark: () => void;
  onOpenBookmark: (bookmark: BookmarkType) => void;
  onRemoveBookmark: (id: string) => void;
  onExportWords: (entries: WordEntry[]) => void;
  onClose: () => void;
};

const TABS: [NavTab, string][] = [
  ["outline", "大纲"],
  ["cards", "文章"],
  ["wordbook", "生词本"],
  ["bookmarks", "书签"],
];

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

function sectionMatches(section: BookSection, query: string): boolean {
  if (!query) return true;
  return (
    matches(section.title, query) ||
    section.articles.some((article) => matches(article.title, query))
  );
}

export function OutlinePanel({
  tab,
  onTab,
  query,
  onQuery,
  book,
  currentHref,
  onOpenArticle,
  articleIndex,
  indexing,
  wordbook,
  known,
  onSelectWord,
  onRemoveWords,
  onRestoreKnown,
  bookmarks,
  canBookmark,
  onAddBookmark,
  onOpenBookmark,
  onRemoveBookmark,
  onExportWords,
  onClose,
}: OutlinePanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"words" | "known">("words");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const normalizedQuery = query.trim().toLowerCase();
  const articleCount = book
    ? book.sections.reduce((sum, section) => sum + section.articles.length, 0)
    : 0;

  const articles = useMemo(
    () => book?.sections.flatMap((section) => section.articles) ?? [],
    [book],
  );

  const visibleSections = useMemo(() => {
    if (!book) return [];
    return book.sections
      .filter((section) => sectionMatches(section, normalizedQuery))
      .map((section) => ({
        ...section,
        articles: section.articles.filter(
          (article) =>
            !normalizedQuery ||
            matches(article.title, normalizedQuery) ||
            matches(section.title, normalizedQuery),
        ),
      }));
  }, [book, normalizedQuery]);

  const visibleCards = useMemo(
    () =>
      articles.filter(
        (article) =>
          !normalizedQuery ||
          matches(article.title, normalizedQuery) ||
          matches(article.sectionTitle, normalizedQuery),
      ),
    [articles, normalizedQuery],
  );

  const wordEntries = useMemo(
    () =>
      Object.values(wordbook).sort((a, b) => b.addedAt - a.addedAt),
    [wordbook],
  );
  const groups = useMemo(() => groupByDay(wordEntries), [wordEntries]);
  const knownEntries = useMemo(
    () => [...known].sort((a, b) => a.localeCompare(b)),
    [known],
  );

  const toggleSection = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelected = (lemma: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lemma)) next.delete(lemma);
      else next.add(lemma);
      return next;
    });
  };

  const selectedEntries = wordEntries.filter((entry) =>
    selected.has(entry.lemma),
  );

  return (
    <aside className="outline-panel">
      <div className="panel-head">
        <ListTree size={20} strokeWidth={1.55} className="panel-head-icon" />
        <span className="panel-title">文档导航</span>
        <button className="icon-button small panel-head-action" type="button" onClick={onClose}>
          <PanelLeftClose size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="nav-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={`nav-tab ${tab === key ? "selected" : ""}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => onTab(key)}
          >
            {label}
            {key === "wordbook" && wordEntries.length ? (
              <span className="tab-count">{wordEntries.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "outline" || tab === "cards" ? (
        <label className="outline-search">
          <Search size={16} strokeWidth={1.7} />
          <input
            value={query}
            placeholder={tab === "outline" ? "搜索板块或文章" : "搜索文章"}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
      ) : null}

      <div className="panel-body">
        {book ? (
          <>
            <div className="doc-title">{book.title}</div>
            <div className="doc-meta">
              {book.sections.length} 个板块 · {articleCount} 篇文章
              {book.issueDate ? ` · ${book.issueDate}` : ""}
            </div>
          </>
        ) : (
          <div className="doc-meta">还没有打开的书</div>
        )}
        <div className="panel-rule" />

        {!book ? <div className="empty-note">先导入一本 epub。</div> : null}

        {book && tab === "outline" ? (
          <div className="outline-list">
            {visibleSections.map((section) => {
              const isCollapsed = collapsed.has(section.id) && !normalizedQuery;
              return (
                <div className="outline-section" key={section.id}>
                  <button
                    className="outline-item section-row"
                    type="button"
                    onClick={() => toggleSection(section.id)}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={15} strokeWidth={1.8} />
                    ) : (
                      <ChevronDown size={15} strokeWidth={1.8} />
                    )}
                    <span className="outline-label">{section.title}</span>
                    <span className="outline-count">{section.articles.length}</span>
                  </button>
                  {!isCollapsed
                    ? section.articles.map((article) => {
                        const active = article.href === currentHref;
                        return (
                          <button
                            key={article.href}
                            className={`outline-item article-row ${active ? "active" : ""}`}
                            type="button"
                            title={article.title}
                            onClick={() => onOpenArticle(article)}
                          >
                            {active ? <span className="outline-indicator" /> : null}
                            <span className="outline-label">{article.title}</span>
                          </button>
                        );
                      })
                    : null}
                </div>
              );
            })}
            {visibleSections.length === 0 ? (
              <div className="empty-note">没有匹配的板块或文章</div>
            ) : null}
          </div>
        ) : null}

        {book && tab === "cards" ? (
          <div className="card-list">
            {visibleCards.map((article) => {
              const data = articleIndex.get(article.href);
              const active = article.href === currentHref;
              return (
                <button
                  key={article.href}
                  className={`article-card ${active ? "active" : ""}`}
                  type="button"
                  onClick={() => onOpenArticle(article)}
                >
                  <span className="card-kicker">{article.sectionTitle}</span>
                  <span className="card-title">{article.title}</span>
                  <span className="card-excerpt">
                    {data?.excerpt || (indexing.done < indexing.total ? "正在索引…" : "（无摘要）")}
                  </span>
                  <span className="card-foot">
                    <span className="card-count">
                      {data ? `${data.hitCount} 个考研词` : "索引中"}
                    </span>
                    {active ? <span className="card-current">正在阅读</span> : null}
                  </span>
                </button>
              );
            })}
            {visibleCards.length === 0 ? (
              <div className="empty-note">没有匹配的文章</div>
            ) : null}
          </div>
        ) : null}

        {tab === "wordbook" ? (
          <div className="wordbook-tab">
            <div className="segment-row">
              <button
                className={`segment ${mode === "words" ? "selected" : ""}`}
                type="button"
                onClick={() => setMode("words")}
              >
                生词本 <span>{wordEntries.length}</span>
              </button>
              <button
                className={`segment ${mode === "known" ? "selected" : ""}`}
                type="button"
                onClick={() => setMode("known")}
              >
                已认识 <span>{known.size}</span>
              </button>
            </div>

            {mode === "words" ? (
              <>
                {wordEntries.length ? (
                  <div className="batch-row">
                    <button
                      className="mini-button"
                      type="button"
                      disabled={!selected.size}
                      onClick={() => onExportWords(selectedEntries)}
                    >
                      <Download size={14} strokeWidth={1.8} />
                      导出选中
                    </button>
                    <button
                      className="mini-button danger"
                      type="button"
                      disabled={!selected.size}
                      onClick={() => {
                        onRemoveWords([...selected]);
                        setSelected(new Set());
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                      删除
                    </button>
                  </div>
                ) : null}

                {groups.map((group) => (
                  <div className="word-group" key={group.day}>
                    <div className="group-title">
                      {group.label}
                      <span>{group.entries.length} 个</span>
                    </div>
                    {group.entries.map((entry) => (
                      <div className="word-row" key={entry.lemma}>
                        <input
                          type="checkbox"
                          checked={selected.has(entry.lemma)}
                          onChange={() => toggleSelected(entry.lemma)}
                          aria-label={`选择 ${entry.lemma}`}
                        />
                        <button
                          className="word-row-main"
                          type="button"
                          onClick={() => onSelectWord(entry.lemma)}
                        >
                          <span className="word-row-title">{entry.lemma}</span>
                          <span className="word-row-trans">
                            {entry.trans[0] ?? "（无释义）"}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}

                {!wordEntries.length ? (
                  <div className="empty-note">生词本还是空的。读文章时点词加入。</div>
                ) : null}
              </>
            ) : (
              <div className="known-list">
                {knownEntries.map((lemma) => (
                  <div className="known-row" key={lemma}>
                    <button
                      className="word-row-main"
                      type="button"
                      onClick={() => onSelectWord(lemma)}
                    >
                      <span className="word-row-title">{lemma}</span>
                    </button>
                    <button
                      className="mini-button"
                      type="button"
                      title="撤销「已认识」"
                      onClick={() => onRestoreKnown(lemma)}
                    >
                      <Undo2 size={14} strokeWidth={1.8} />
                      撤销
                    </button>
                  </div>
                ))}
                {!knownEntries.length ? (
                  <div className="empty-note">还没有标记为「已认识」的词。</div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {tab === "bookmarks" ? (
          <div className="bookmark-tab">
            <button
              className="bookmark-add"
              type="button"
              disabled={!canBookmark}
              onClick={onAddBookmark}
            >
              <BookmarkPlus size={16} strokeWidth={1.7} />
              为当前文章加书签
            </button>

            {bookmarks.map((mark) => (
              <div className="bookmark-row" key={mark.id}>
                <button
                  className="bookmark-main"
                  type="button"
                  onClick={() => onOpenBookmark(mark)}
                >
                  <Bookmark size={15} strokeWidth={1.6} />
                  <span>
                    <strong>{mark.articleTitle}</strong>
                    <em>
                      {mark.bookTitle} · {mark.section} ·{" "}
                      {dayLabel(
                        new Date(mark.createdAt).toISOString().slice(0, 10),
                        Date.now(),
                      )}
                    </em>
                  </span>
                </button>
                <button
                  className="icon-button small"
                  type="button"
                  title="删除书签"
                  onClick={() => onRemoveBookmark(mark.id)}
                >
                  <Trash2 size={15} strokeWidth={1.7} />
                </button>
              </div>
            ))}

            {!bookmarks.length ? (
              <div className="bookmark-empty">
                <Bookmark size={20} strokeWidth={1.5} />
                <p>还没有书签</p>
                <span>读到重要的地方，点上面的按钮记下来。</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "outline" || tab === "cards" ? (
          <>
            <div className="panel-rule tools-rule" />
            <div className="panel-eyebrow">精读工具</div>
            <p className="tool-hint">
              文中带下划线的词来自当前启用的词表。
              <br />
              点词查看释义，不认识的收进生词本。
            </p>
          </>
        ) : null}
      </div>

      <div className="panel-footer">
        <div className="panel-rule" />
        <div className="footer-title">外刊精读模式</div>
        <div className="footer-note">左侧大纲 · 右侧查词</div>
      </div>
    </aside>
  );
}
