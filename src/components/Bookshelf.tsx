import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  LayoutGrid,
  Library,
  List,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  SunMedium,
  Trash2,
} from "lucide-react";
import type { Bookmark, WordEntry } from "../types";
import type { StoredBook } from "../lib/store";
import { Topbar } from "./Topbar";

type FilterKey = "all" | "reading" | "unread" | "finished" | "words";
type SortKey = "recent" | "imported" | "title";
type ViewMode = "grid" | "list";

type ShelfBook = {
  record: StoredBook;
  title: string;
  issue: string;
  meta: string;
  status: "在读" | "未读" | "已读完";
  progress: number;
  words: number;
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "reading", label: "在读" },
  { key: "unread", label: "未读" },
  { key: "finished", label: "已读完" },
  { key: "words", label: "生词本" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "最近阅读" },
  { key: "imported", label: "最近导入" },
  { key: "title", label: "书名" },
];

const PALETTES = [
  { bg: "#24302a", accent: "#8fae7f", ink: "#cbd9c2" },
  { bg: "#2e2622", accent: "#c9a87c", ink: "#e2d3c4" },
  { bg: "#232a33", accent: "#8fa6c2", ink: "#c8d6e6" },
  { bg: "#332426", accent: "#c08a8f", ink: "#e8cbce" },
  { bg: "#2b2b24", accent: "#b5ae7e", ink: "#ddd9c4" },
  { bg: "#25262e", accent: "#9aa0c4", ink: "#cfd2e0" },
  { bg: "#2c2419", accent: "#c3a166", ink: "#e3d2b6" },
  { bg: "#1f2a2a", accent: "#86b3ae", ink: "#c6dcd9" },
  { bg: "#2a2430", accent: "#a995c4", ink: "#d8cbe4" },
  { bg: "#2f2326", accent: "#c08e96", ink: "#e6c9ce" },
  { bg: "#22292e", accent: "#8faebf", ink: "#cad8df" },
  { bg: "#2d2a20", accent: "#bfaf74", ink: "#e0d6b8" },
];

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function paletteFor(bookId: string) {
  return PALETTES[hashText(bookId) % PALETTES.length];
}

function isLatinTitle(title: string): boolean {
  return /^[\x20-\x7e]+$/.test(title);
}

function cleanTitle(record: StoredBook): string {
  const title = record.title?.trim();
  if (title) return title;
  return record.fileName.replace(/\.epub$/i, "");
}

function issueLabel(record: StoredBook): string {
  if (record.issueDate) return record.issueDate.replace(/-/g, ".");
  return formatDate(record.savedAt);
}

function progressOf(record: StoredBook): number {
  if (!record.lastArticleId) return 0;
  const total = record.articleCount ?? 0;
  if (!total) return 0;
  const index = record.lastArticleIndex ?? 0;
  return Math.min(100, Math.round(((index + 1) / total) * 100));
}

function statusOf(record: StoredBook): ShelfBook["status"] {
  if (!record.lastArticleId) return "未读";
  return progressOf(record) >= 100 ? "已读完" : "在读";
}

export type BookshelfProps = {
  books: StoredBook[];
  busy: boolean;
  light: boolean;
  wordbook: Record<string, WordEntry>;
  known: Set<string>;
  bookmarks: Bookmark[];
  onImport: (file: File) => void;
  onOpen: (book: StoredBook) => void;
  onDelete: (bookId: string) => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
  onOpenVocab?: () => void;
  onToggleLight: () => void;
  onToast: (message: string) => void;
};

function Cover({
  book,
  mini = false,
  large = false,
}: {
  book: ShelfBook;
  mini?: boolean;
  large?: boolean;
}) {
  const palette = paletteFor(book.record.bookId);
  const style = {
    background: palette.bg,
    "--cover-accent": palette.accent,
    "--cover-ink": palette.ink,
  } as CSSProperties;

  return (
    <div
      className={`book-cover${mini ? " mini" : ""}${large ? " large" : ""}`}
      style={style}
    >
      <span className="cover-band" />
      <span className="cover-kicker">Quiet Reader</span>
      <span className={`cover-title${isLatinTitle(book.title) ? " latin" : ""}`}>
        {book.title}
      </span>
      <span className="cover-rule" />
      <span className="cover-foot">{book.issue}</span>
    </div>
  );
}

function BookCard({
  book,
  manage,
  onOpen,
  onDelete,
}: {
  book: ShelfBook;
  manage: boolean;
  onOpen: (book: StoredBook) => void;
  onDelete: (bookId: string) => void;
}) {
  const palette = paletteFor(book.record.bookId);
  return (
    <div
      className={`book-card${manage ? " managing" : ""}`}
      role="button"
      tabIndex={0}
      title={book.record.fileName}
      onClick={() => {
        if (!manage) onOpen(book.record);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !manage) onOpen(book.record);
      }}
    >
      <Cover book={book} />
      <button
        className="card-delete"
        type="button"
        title="从书架移除"
        aria-label={`从书架移除 ${book.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(book.record.bookId);
        }}
      >
        <Trash2 size={13} strokeWidth={1.8} />
      </button>
      <span className="card-title">{book.title}</span>
      <span className="card-meta">{book.meta}</span>
      <span className="card-progress">
        <span
          className="card-progress-fill"
          style={{ width: `${book.progress}%`, background: palette.accent }}
        />
      </span>
    </div>
  );
}

function BookRow({
  book,
  manage,
  onOpen,
  onDelete,
}: {
  book: ShelfBook;
  manage: boolean;
  onOpen: (book: StoredBook) => void;
  onDelete: (bookId: string) => void;
}) {
  const palette = paletteFor(book.record.bookId);
  return (
    <div
      className="book-row"
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!manage) onOpen(book.record);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !manage) onOpen(book.record);
      }}
    >
      <Cover book={book} mini />
      <span className="row-main">
        <span className="row-title">{book.title}</span>
        <span className="row-file">{book.record.fileName}</span>
      </span>
      <span className="row-status">
        <span className={`status-dot ${book.status === "在读" ? "live" : ""}`} />
        {book.status}
      </span>
      <span className="row-progress">
        <span className="row-progress-bar">
          <span
            style={{ width: `${book.progress}%`, background: palette.accent }}
          />
        </span>
        <span className="row-percent">{book.progress}%</span>
      </span>
      <span className="row-meta">{book.meta}</span>
      <button
        className="row-delete"
        type="button"
        title="从书架移除"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(book.record.bookId);
        }}
      >
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

export function Bookshelf({
  books,
  busy,
  light,
  wordbook,
  known,
  bookmarks,
  onImport,
  onOpen,
  onDelete,
  onOpenPlugins,
  onOpenSettings,
  onOpenVocab,
  onToggleLight,
  onToast,
}: BookshelfProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [manage, setManage] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  const wordCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of Object.values(wordbook)) {
      if (!entry.bookId) continue;
      counts[entry.bookId] = (counts[entry.bookId] ?? 0) + 1;
    }
    return counts;
  }, [wordbook]);

  const shelves = useMemo<ShelfBook[]>(() => {
    return books.map((record) => {
      const progress = progressOf(record);
      const status = statusOf(record);
      const pages = record.articleCount
        ? `${record.articleCount} 篇`
        : "EPUB";
      return {
        record,
        title: cleanTitle(record),
        issue: issueLabel(record),
        meta: `${pages} · ${status}`,
        status,
        progress,
        words: wordCounts[record.bookId] ?? 0,
      };
    });
  }, [books, wordCounts]);

  const counts = useMemo(() => {
    const result: Record<FilterKey, number> = {
      all: shelves.length,
      reading: 0,
      unread: 0,
      finished: 0,
      words: 0,
    };
    for (const book of shelves) {
      if (book.status === "在读") result.reading += 1;
      if (book.status === "未读") result.unread += 1;
      if (book.status === "已读完") result.finished += 1;
      if (book.words > 0) result.words += 1;
    }
    return result;
  }, [shelves]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = shelves.filter((book) => {
      if (filter === "reading" && book.status !== "在读") return false;
      if (filter === "unread" && book.status !== "未读") return false;
      if (filter === "finished" && book.status !== "已读完") return false;
      if (filter === "words" && book.words === 0) return false;
      if (!needle) return true;
      return (
        book.title.toLowerCase().includes(needle) ||
        book.record.fileName.toLowerCase().includes(needle)
      );
    });
    return filtered.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "zh-Hans-CN");
      if (sort === "imported") return b.record.savedAt - a.record.savedAt;
      const aRecent = a.record.lastOpenedAt ?? a.record.savedAt;
      const bRecent = b.record.lastOpenedAt ?? b.record.savedAt;
      return bRecent - aRecent;
    });
  }, [shelves, filter, query, sort]);

  const continueBook = useMemo(() => {
    const started = shelves.filter((book) => book.record.lastArticleId);
    if (!started.length) return null;
    return started.reduce((best, book) => {
      const bestAt = best.record.lastOpenedAt ?? best.record.savedAt;
      const at = book.record.lastOpenedAt ?? book.record.savedAt;
      return at > bestAt ? book : best;
    });
  }, [shelves]);

  const totalWords = useMemo(() => Object.keys(wordbook).length, [wordbook]);

  const showContinue =
    Boolean(continueBook) && filter === "all" && !query.trim() && !manage;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "Escape") {
        setSortOpen(false);
        setMoreOpen(false);
        if (document.activeElement === searchRef.current) {
          setQuery("");
          searchRef.current?.blur();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const pickFile = () => fileRef.current?.click();

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onImport(file);
  };

  const readingHint = continueBook?.record.lastArticleIndex != null
    ? `上次读到第 ${continueBook.record.lastArticleIndex + 1} 篇 · 共 ${
        continueBook.record.articleCount ?? 0
      } 篇`
    : "从第一篇开始阅读";

  return (
    <>
      <Topbar
        nav={[
          {
            key: "shelf",
            label: "书架",
            active: filter !== "words",
            onClick: () => setFilter("all"),
          },
          {
            key: "notes",
            label: "笔记",
            onClick: () =>
              onToast("笔记功能尚未上线；阅读时可以在右侧面板添加书签。"),
          },
          { key: "dict", label: "词典", onClick: onOpenPlugins },
          {
            key: "vocab",
            label: "生词本",
            onClick: onOpenVocab ? onOpenVocab : () => setFilter("words"),
          },
          { key: "settings", label: "设置", onClick: onOpenSettings },
        ]}
        right={
          <>
        <label className="shelf-search">
          <Search size={16} strokeWidth={1.7} />
          <input
            ref={searchRef}
            value={query}
            placeholder="搜索书名或文件名"
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="kbd">Ctrl K</span>
        </label>

        <button
          className="shelf-import"
          type="button"
          disabled={busy}
          onClick={pickFile}
        >
          <Plus size={14} strokeWidth={2} />
          {busy ? "正在导入…" : "导入"}
        </button>

        <div className="shelf-view-toggle" role="group" aria-label="视图">
          <button
            className={view === "grid" ? "selected" : ""}
            type="button"
            title="网格视图"
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={14} strokeWidth={1.6} />
          </button>
          <button
            className={view === "list" ? "selected" : ""}
            type="button"
            title="列表视图"
            onClick={() => setView("list")}
          >
            <List size={14} strokeWidth={1.6} />
          </button>
        </div>

        <div className="shelf-tools" ref={toolsRef}>
          <button
            className={`shelf-icon${light ? " active" : ""}`}
            type="button"
            title={light ? "切换为深色模式" : "切换为浅色模式"}
            onClick={onToggleLight}
          >
            {light ? <Moon size={19} strokeWidth={1.6} /> : <SunMedium size={19} strokeWidth={1.6} />}
          </button>
          <button
            className={`shelf-icon${moreOpen ? " active" : ""}`}
            type="button"
            title="更多"
            onClick={() => {
              setSortOpen(false);
              setMoreOpen((open) => !open);
            }}
          >
            <MoreHorizontal size={19} strokeWidth={1.8} />
          </button>

          {moreOpen ? (
            <div className="shelf-popover">
              <button
                className="shelf-popover-row"
                type="button"
                onClick={() => {
                  onOpenSettings();
                  setMoreOpen(false);
                }}
              >
                设置…
              </button>
              <button
                className="shelf-popover-row"
                type="button"
                onClick={() => {
                  onOpenPlugins();
                  setMoreOpen(false);
                }}
              >
                词库管理
              </button>
              <div className="shelf-popover-sep" />
              <button
                className="shelf-popover-row muted"
                type="button"
                onClick={() => {
                  onToast("快捷键：Ctrl + K 聚焦搜索，Esc 清空搜索");
                  setMoreOpen(false);
                }}
              >
                键盘快捷键
              </button>
              <button
                className="shelf-popover-row muted"
                type="button"
                onClick={() => {
                  onToast("Quiet Reader · 本地 EPUB 精读工具");
                  setMoreOpen(false);
                }}
              >
                关于 Quiet Reader
              </button>
            </div>
          ) : null}
            </div>
          </>
        }
      />

      <input
        ref={fileRef}
        className="shelf-file-input"
        type="file"
        accept=".epub"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          event.target.value = "";
        }}
      />

      <main
        className={`shelf-main${dragging ? " dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div className="shelf-head">
          <div>
            <h1>我的书架</h1>
            <p className="shelf-sub">
              共 {books.length} 本藏书 · {counts.reading} 本在读 · 数据保存在本机
            </p>
          </div>

          <div className="shelf-head-tools">
            <div className="shelf-filters" role="group" aria-label="筛选">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  className={filter === item.key ? "selected" : ""}
                  type="button"
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                  <span className="filter-count">{counts[item.key]}</span>
                </button>
              ))}
            </div>

            <div className="shelf-sort">
              <button
                className={`shelf-sort-button${sortOpen ? " open" : ""}`}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setSortOpen((open) => !open);
                }}
              >
                {SORTS.find((item) => item.key === sort)?.label}
                <ChevronDown size={12} strokeWidth={1.7} />
              </button>
              {sortOpen ? (
                <div className="shelf-sort-menu">
                  {SORTS.map((item) => (
                    <button
                      key={item.key}
                      className="shelf-sort-row"
                      type="button"
                      onClick={() => {
                        setSort(item.key);
                        setSortOpen(false);
                      }}
                    >
                      <span>{item.label}</span>
                      {sort === item.key ? (
                        <Check size={13} strokeWidth={2} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="shelf-view-toggle head-toggle" role="group" aria-label="视图">
              <button
                className={view === "grid" ? "selected" : ""}
                type="button"
                title="网格视图"
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={14} strokeWidth={1.6} />
              </button>
              <button
                className={view === "list" ? "selected" : ""}
                type="button"
                title="列表视图"
                onClick={() => setView("list")}
              >
                <List size={14} strokeWidth={1.6} />
              </button>
            </div>
          </div>
        </div>

        {showContinue && continueBook ? (
          <>
            <div className="shelf-section-label">
              <span>继续阅读</span>
            </div>
            <section className="continue-card">
              <Cover book={continueBook} large />
              <div className="continue-info">
                <h2 title={continueBook.title}>{continueBook.title}</h2>
                <p className="continue-meta">{continueBook.meta}</p>
                <div className="continue-progress">
                  <span className="continue-bar">
                    <span
                      style={{
                        width: `${continueBook.progress}%`,
                        background: paletteFor(continueBook.record.bookId).accent,
                      }}
                    />
                  </span>
                  <span className="continue-percent">
                    {continueBook.progress}%
                  </span>
                </div>
                <p className="continue-hint">{readingHint}</p>
              </div>

              <div className="continue-stats">
                <div>
                  <span className="stat-label">生词</span>
                  <span className="stat-value">{totalWords} 词</span>
                </div>
                <div>
                  <span className="stat-label">已认识</span>
                  <span className="stat-value">{known.size} 词</span>
                </div>
                <div>
                  <span className="stat-label">书签</span>
                  <span className="stat-value">{bookmarks.length} 条</span>
                </div>
              </div>

              <div className="continue-actions">
                <button
                  className="ghost-button shelf-ghost"
                  type="button"
                  onClick={onOpenPlugins}
                >
                  词库管理
                </button>
                <button
                  className="primary-button shelf-primary"
                  type="button"
                  onClick={() => onOpen(continueBook.record)}
                >
                  <BookOpen size={15} strokeWidth={1.8} />
                  继续阅读
                </button>
              </div>
            </section>
          </>
        ) : null}

        <div className="shelf-section-row">
          <div className="shelf-section-label">
            <span>全部藏书</span>
            <em>{visible.length}</em>
          </div>
          {books.length ? (
            <button
              className="manage-button"
              type="button"
              onClick={() => setManage((value) => !value)}
            >
              {manage ? "完成" : "管理书架"}
            </button>
          ) : null}
        </div>

        {books.length === 0 ? (
          <section className="shelf-empty">
            <span className="empty-icon">
              <Library size={24} strokeWidth={1.5} />
            </span>
            <h2>书架还是空的</h2>
            <p>
              导入一本 EPUB 开始精读。每期外刊会自动拆分成可点读的文章，
              生词、书签和进度都保存在这台设备上。
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={pickFile}
              disabled={busy}
            >
              <Plus size={16} strokeWidth={2} />
              {busy ? "正在导入…" : "导入 EPUB"}
            </button>
            <span className="empty-hint">
              也可以把 .epub 文件直接拖进这个窗口
            </span>
          </section>
        ) : visible.length === 0 ? (
          <div className="shelf-no-result">
            <p>没有符合条件的书</p>
            <button
              type="button"
              className="mini-button"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              清除筛选
            </button>
          </div>
        ) : view === "grid" ? (
          <div className={`shelf-grid${manage ? " managing" : ""}`}>
            {visible.map((book) => (
              <BookCard
                key={book.record.bookId}
                book={book}
                manage={manage}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          <div className="shelf-list">
            {visible.map((book) => (
              <BookRow
                key={book.record.bookId}
                book={book}
                manage={manage}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="shelf-status">
        <span className="status-dot-big" />
        <span>{busy ? "正在解析图书…" : "本地书库已就绪"}</span>
        <span className="spacer" />
        <span className="muted">
          {books.length} 本藏书 · {totalWords} 个生词 · {bookmarks.length} 条书签
        </span>
        <span className="muted version">Quiet Reader · 本地版</span>
      </footer>
    </>
  );
}
