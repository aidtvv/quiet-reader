import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { OutlinePanel } from "./components/OutlinePanel";
import { Reader, type WordPick } from "./components/Reader";
import { WordPanel } from "./components/WordPanel";
import { Bookshelf } from "./components/Bookshelf";
import { PluginManager } from "./components/PluginManager";
import { SettingsPage } from "./components/SettingsPage";
import { VocabularyPage } from "./components/VocabularyPage";
import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  THEMES,
  applyTheme,
} from "./lib/themes";
import { BASIC_WORDS } from "./lib/basicWords";
import { openEpub, type ArticleText, type EpubSource } from "./lib/epub";
import {
  analyzeText,
  buildIndex,
  loadLemmaMap,
  loadManifest,
  loadPluginData,
  lookup,
  type DictIndex,
} from "./lib/dict";
import { renderArticleHtml } from "./lib/highlight";
import { loadShelf } from "./lib/shelf";
import { readBookFile, removeBookFile, saveBookFile } from "./lib/library";
import { addWord, removeWord, toggleKnown } from "./lib/wordbook";
import { ankiFileName, downloadText, toAnkiTsv } from "./lib/anki";
import {
  deleteBook,
  getBook,
  loadBookmarks,
  loadCustomPlugins,
  loadKnown,
  loadSettings,
  loadWordbook,
  saveBook,
  saveBookmarks,
  saveCustomPlugins,
  saveKnown,
  saveSettings,
  saveWordbook,
  updateBookPosition,
  type CustomPlugin,
  type StoredBook,
} from "./lib/store";
import type {
  ArticleIndexEntry,
  ArticleRef,
  Bookmark,
  Bookmark as BookmarkType,
  NavTab,
  ParsedBook,
  PluginMeta,
  Settings,
  WordEntry,
  WordListEntry,
} from "./types";

const EMPTY_INDEX: DictIndex = buildIndex([], {});
const EMPTY_BASIC: Set<string> = new Set();

function fitZoom() {
  const availableWidth = window.innerWidth - 48 - 16;
  const availableHeight = window.innerHeight - 104 - 48;
  const ratio = Math.min(availableWidth / 872, availableHeight / 848);
  return Math.max(45, Math.min(130, Math.floor(ratio * 100)));
}

function fileError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "处理失败，请检查文件是否完整。";
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [leftPinned, setLeftPinned] = useState(
    () => loadSettings().leftPinned ?? false,
  );
  const [rightPinned, setRightPinned] = useState(
    () => loadSettings().rightPinned ?? false,
  );
  const [leftHover, setLeftHover] = useState(false);
  const [rightHover, setRightHover] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [tab, setTab] = useState<NavTab>("outline");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<EpubSource | null>(null);
  const [book, setBook] = useState<ParsedBook | null>(null);
  const [article, setArticle] = useState<Awaited<ReturnType<EpubSource["loadArticle"]>> | null>(null);
  const [restoreScroll, setRestoreScroll] = useState(0);
  const [articleTexts, setArticleTexts] = useState<Map<string, ArticleText>>(
    () => new Map(),
  );
  const [indexing, setIndexing] = useState({ done: 0, total: 0 });
  const [pluginMetas, setPluginMetas] = useState<PluginMeta[]>([]);
  const [customPlugins, setCustomPlugins] = useState<CustomPlugin[]>(() =>
    loadCustomPlugins(),
  );
  const [entriesById, setEntriesById] = useState<
    Record<string, WordListEntry[] | undefined>
  >({});
  const [lemmaMap, setLemmaMap] = useState<Record<string, string>>({});
  const [wordbook, setWordbook] = useState<Record<string, WordEntry>>(() =>
    loadWordbook(),
  );
  const [known, setKnown] = useState<Set<string>>(() => loadKnown());
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks());
  const [recent, setRecent] = useState<StoredBook[]>([]);
  const [selected, setSelected] = useState<WordPick | null>(null);
  const [autoFit, setAutoFit] = useState(() => loadSettings().autoFit ?? true);
  const [zoom, setZoom] = useState(() => loadSettings().zoom || fitZoom());
  const [warm, setWarm] = useState(() => loadSettings().warm);
  const [light, setLight] = useState(() => loadSettings().light ?? false);
  const [darkTheme, setDarkTheme] = useState(
    () => loadSettings().darkTheme ?? DEFAULT_DARK_THEME,
  );
  const [lightTheme, setLightTheme] = useState(
    () => loadSettings().lightTheme ?? DEFAULT_LIGHT_THEME,
  );
  const [filterBasic, setFilterBasic] = useState(
    () => loadSettings().filterBasic ?? true,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [jumpSignal, setJumpSignal] = useState(0);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const sourceRef = useRef<EpubSource | null>(null);
  const entriesRef = useRef(entriesById);
  const indexToken = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const scrollTimer = useRef<number | null>(null);

  const enabled = useMemo(
    () => new Set(settings.enabledPlugins),
    [settings.enabledPlugins],
  );
  const savedSet = useMemo(() => new Set(Object.keys(wordbook)), [wordbook]);
  const activeThemeKey = light ? lightTheme : darkTheme;
  const themed = activeThemeKey !== DEFAULT_DARK_THEME;
  const basicSet = useMemo(
    () => (filterBasic ? BASIC_WORDS : EMPTY_BASIC),
    [filterBasic],
  );

  useLayoutEffect(() => {
    applyTheme(activeThemeKey);
  }, [activeThemeKey]);

  useLayoutEffect(() => {
    const style = document.documentElement.style;
    const font =
      settings.fontFamily === "inter"
        ? '"Inter", "Noto Sans SC", system-ui, sans-serif'
        : settings.fontFamily === "system"
        ? 'system-ui, sans-serif'
        : '"Lora", "Source Serif 4", Georgia, serif';
    style.setProperty("--qr-font", font);
    style.setProperty("--qr-font-size", `${settings.fontSize ?? 18}px`);
    style.setProperty("--qr-line-height", String(settings.lineHeight ?? 1.75));
    style.setProperty("--qr-reader-width", `${settings.readerWidth ?? 744}px`);
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.readerWidth,
  ]);

  useEffect(() => {
    entriesRef.current = entriesById;
  }, [entriesById]);

  useEffect(() => {
    saveWordbook(wordbook);
  }, [wordbook]);

  useEffect(() => {
    saveKnown(known);
  }, [known]);

  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    saveSettings({
      ...settings,
      filterBasic,
      warm,
      light,
      darkTheme,
      lightTheme,
      zoom,
      autoFit,
      leftPinned,
      rightPinned,
    });
  }, [
    settings,
    filterBasic,
    warm,
    light,
    darkTheme,
    lightTheme,
    zoom,
    autoFit,
    leftPinned,
    rightPinned,
  ]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  const ensureEntries = useCallback(async (meta: PluginMeta) => {
    if (entriesRef.current[meta.id]) return;
    try {
      const data = await loadPluginData(meta);
      setEntriesById((current) => ({ ...current, [meta.id]: data }));
    } catch {
      // Failed to load optional plugin list.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await loadManifest();
        if (cancelled) return;
        setPluginMetas(manifest);
        const lemma = await loadLemmaMap();
        if (cancelled) return;
        setLemmaMap(lemma);

        const active = new Set(settings.enabledPlugins);
        if (active.size === 0) {
          const defaults = manifest.filter((p) => p.defaultEnabled);
          if (defaults.length) {
            setSettings((current) => ({
              ...current,
              enabledPlugins: defaults.map((p) => p.id),
            }));
            for (const meta of defaults) void ensureEntries(meta);
          }
        } else {
          for (const meta of manifest) {
            if (active.has(meta.id)) void ensureEntries(meta);
          }
        }
      } catch {
        // Failed to initialize dictionary manifest.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureEntries, settings.enabledPlugins]);

  const index = useMemo(() => {
    const lists: { meta: PluginMeta; entries: WordListEntry[] }[] = [];
    for (const meta of pluginMetas) {
      if (!enabled.has(meta.id)) continue;
      const loaded = entriesById[meta.id];
      if (loaded) lists.push({ meta, entries: loaded });
    }
    for (const plugin of customPlugins) {
      if (!enabled.has(plugin.id)) continue;
      lists.push({
        meta: plugin,
        entries: entriesById[plugin.id] ?? plugin.entries,
      });
    }
    if (!lists.length) return EMPTY_INDEX;
    return buildIndex(lists, lemmaMap);
  }, [pluginMetas, customPlugins, enabled, entriesById, lemmaMap]);

  const allRefs = useMemo(() => {
    if (!book) return [];
    return book.sections.flatMap((section) => section.articles);
  }, [book]);

  const articleIndex = useMemo(() => {
    const map = new Map<string, ArticleIndexEntry>();
    for (const ref of allRefs) {
      const text = articleTexts.get(ref.href);
      if (!text) {
        map.set(ref.href, { excerpt: "", hitCount: 0 });
        continue;
      }
      const analyzed = analyzeText(index, text.plainText, basicSet);
      map.set(ref.href, {
        excerpt: text.excerpt,
        hitCount: analyzed,
      });
    }
    return map;
  }, [allRefs, articleTexts, index, basicSet]);

  const articleHtml = useMemo(() => {
    if (!article) return "";
    return renderArticleHtml(article.html, {
      index,
      known,
      saved: savedSet,
      basic: basicSet,
    });
  }, [article, index, basicSet, savedSet, known]);

  const indexBook = useCallback(
    async (src: EpubSource) => {
      const token = ++indexToken.current;
      const refs = src.book.sections.flatMap((section) => section.articles);
      const collected = new Map<string, ArticleText>();
      for (let i = 0; i < refs.length; i += 1) {
        if (indexToken.current !== token) return;
        const ref = refs[i];
        try {
          const loaded = await src.loadArticle(ref.href);
          collected.set(ref.href, loaded);
        } catch {
          // Skip unreadable section.
        }
        if (indexToken.current !== token) return;
        if (i % 5 === 4 || i === refs.length - 1) {
          setArticleTexts(new Map(collected));
          setIndexing({ done: i + 1, total: refs.length });
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
    },
    [],
  );

  const showArticle = useCallback(
    async (src: EpubSource, ref: ArticleRef) => {
      try {
        const loaded = await src.loadArticle(ref.href);
        if (sourceRef.current !== src) return;
        setArticle(loaded);
        setSelected(null);
        setSearchQuery("");
        setSearchOpen(false);
        setRestoreScroll(0);
        setSettings((current) =>
          current.lastArticleByBook[src.book.bookId] === ref.href
            ? current
            : {
                ...current,
                lastArticleByBook: {
                  ...current.lastArticleByBook,
                  [src.book.bookId]: ref.href,
                },
              },
        );
        const refs = src.book.sections.flatMap((section) => section.articles);
        void updateBookPosition(src.book.bookId, ref.href, 0, {
          articleIndex: refs.findIndex((item) => item.href === ref.href),
          articleCount: refs.length,
        });
      } catch (loadError) {
        setError(fileError(loadError));
      }
    },
    [],
  );

  const openData = useCallback(
    async (
      data: ArrayBuffer,
      fileName: string,
      restore?: { articleId?: string; scrollTop?: number },
      fromImport = false,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const src = await openEpub(data, fileName);
        sourceRef.current?.close();
        sourceRef.current = src;
        setSource(src);
        setBook(src.book);
        setArticle(null);
        setArticleTexts(new Map());
        const refs = src.book.sections.flatMap((section) => section.articles);
        setIndexing({ done: 0, total: refs.length });
        setRestoreScroll(restore?.scrollTop ?? 0);
        setSettings((current) => ({
          ...current,
          lastBookId: src.book.bookId,
        }));

        const existing = await getBook(src.book.bookId).catch(() => null);
        const record: StoredBook = {
          bookId: src.book.bookId,
          fileName,
          title: src.book.title,
          issueDate: src.book.issueDate,
          bytes: data,
          savedAt: existing?.savedAt ?? Date.now(),
          lastArticleId: restore?.articleId,
          scrollTop: restore?.scrollTop,
          articleCount: refs.length,
          lastArticleIndex: restore?.articleId
            ? refs.findIndex((item) => item.href === restore.articleId)
            : undefined,
          lastOpenedAt: Date.now(),
        };
        try {
          await saveBook(record);
          setRecent(await loadShelf());
        } catch {
          // Private mode or quota: the book still works this session.
        }

        // 桌面端再把原文写进用户目录的书库：文件名就是内容哈希，同书只会有一份。
        const saved = await saveBookFile(data, fileName, src.book.title);
        if (saved?.existed && fromImport) {
          showToast("这本书已在书库中（按内容哈希去重），直接打开已有条目");
        }

        void indexBook(src);

        const ref =
          refs.find((item) => item.href === restore?.articleId) ?? refs[0];
        if (ref) await showArticle(src, ref);
      } catch (openError) {
        setError(fileError(openError));
      } finally {
        setBusy(false);
      }
    },
    [indexBook, showArticle, showToast],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const books = await loadShelf();
      if (!cancelled) setRecent(books);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      sourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!autoFit) return;
    const update = () => setZoom(fitZoom());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [autoFit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withCtrl = event.ctrlKey || event.metaKey;
      if (withCtrl && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (withCtrl && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        setAutoFit(false);
        setZoom((value) => Math.min(240, value + 10));
      }
      if (withCtrl && event.key === "-") {
        event.preventDefault();
        setAutoFit(false);
        setZoom((value) => Math.max(40, value - 10));
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openFile = async (file: File) => {
    if (!/\.epub$/i.test(file.name)) {
      setError("请选择 .epub 文件。");
      return;
    }
    const data = await file.arrayBuffer();
    await openData(data, file.name, undefined, true);
  };

  const openRecent = (record: StoredBook) => {
    void (async () => {
      // 只在磁盘书库里存在的条目（例如 WebView 缓存被清理过）：按哈希取回原文件。
      let bytes = record.bytes;
      if (!bytes.byteLength) {
        const fromDisk = await readBookFile(record.bookId);
        if (!fromDisk || !fromDisk.byteLength) {
          showToast("书库文件缺失，可能已被移动或删除");
          setRecent(await loadShelf());
          return;
        }
        bytes = fromDisk;
      }
      await openData(bytes, record.fileName, {
        articleId: record.lastArticleId,
        scrollTop: record.scrollTop,
      });
    })();
  };

  const closeBook = () => {
    indexToken.current += 1;
    sourceRef.current?.close();
    sourceRef.current = null;
    setSource(null);
    setBook(null);
    setArticle(null);
    setArticleTexts(new Map());
    setIndexing({ done: 0, total: 0 });
    setSelected(null);
    setSearchQuery("");
    setSearchOpen(false);
    setError(null);
    setLeftHover(false);
    setRightHover(false);
    setRightOpen(false);
  };

  const removeShelfBook = (bookId: string) => {
    void (async () => {
      await deleteBook(bookId).catch(() => undefined);
      // 书库文件也一起删掉，否则下次启动会按目录把它恢复回书架。
      await removeBookFile(bookId).catch(() => undefined);
      if (book?.bookId === bookId) closeBook();
      setRecent(await loadShelf());
      showToast("已从书架移除");
    })();
  };

  const openArticle = (ref: ArticleRef) => {
    if (source) void showArticle(source, ref);
  };

  const currentIndex = article
    ? allRefs.findIndex((ref) => ref.href === article.ref.href)
    : -1;

  const goRelative = (delta: number) => {
    const target = allRefs[currentIndex + delta];
    if (target && source) void showArticle(source, target);
  };

  const pickWord = (pick: WordPick) => {
    if (settings.clickLookup === false) return;
    setSelected(pick);
    setRightOpen(true);
    if (settings.autoSpeak && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(pick.surface || pick.lemma);
      utter.lang = "en-US";
      window.speechSynthesis.speak(utter);
    }
    if (settings.autoSaveWord && !wordbook[pick.lemma]) {
      const hit = lookup(index, pick.lemma);
      setWordbook((current) => {
        if (current[pick.lemma]) return current;
        return {
          ...current,
          [pick.lemma]: {
            lemma: pick.lemma,
            surface: pick.surface,
            phonetic: hit?.entry.usphone || hit?.entry.ukphone || "",
            trans: hit?.entry.trans ?? [],
            lists: hit?.lists ?? [],
            sentence: pick.sentence,
            bookId: book?.bookId,
            bookTitle: book?.title,
            section: article?.ref.sectionTitle,
            articleId: article?.ref.href,
            articleTitle: article?.ref.title,
            addedAt: Date.now(),
          },
        };
      });
    }
  };

  const toggleLight = () => {
    setLight((value) => !value);
    setWarm(false);
  };

  const toggleWarm = () => {
    setWarm((value) => {
      if (!value) {
        setLight(false);
        setDarkTheme(DEFAULT_DARK_THEME);
      }
      return !value;
    });
  };

  const pickTheme = (key: string) => {
    const entry = THEMES[key];
    if (!entry) return;
    if (entry.dark) {
      setDarkTheme(key);
      setLight(false);
    } else {
      setLightTheme(key);
      setLight(true);
    }
    setWarm(false);
    showToast(`已切换主题 · ${entry.label}`);
  };

  const toggleRightPinned = () => {
    setRightPinned((value) => {
      if (!value) setRightOpen(true);
      return !value;
    });
  };

  const leftVisible = leftPinned || leftHover;
  const rightVisible = rightPinned || rightHover || rightOpen;

  const selectKnownWord = (lemma: string) => {
    const stored = wordbook[lemma];
    setSelected({
      lemma,
      surface: stored?.surface ?? lemma,
      sentence: stored?.sentence ?? "",
    });
    setRightOpen(true);
  };

  const selectedEntry = useMemo(() => {
    if (!selected) return null;
    const hit = lookup(index, selected.lemma);
    if (hit) return hit;
    const stored = wordbook[selected.lemma];
    if (stored) {
      return {
        lemma: stored.lemma,
        entry: {
          name: stored.lemma,
          trans: stored.trans,
          usphone: stored.phonetic,
        },
        lists: stored.lists,
      };
    }
    return null;
  }, [selected, index, wordbook]);

  const selectedKnown = selected ? known.has(selected.lemma) : false;
  const selectedSaved = selected ? Boolean(wordbook[selected.lemma]) : false;

  const listNames = useMemo(() => {
    return (selectedEntry?.lists ?? []).map((id) => {
      const meta =
        pluginMetas.find((plugin) => plugin.id === id) ??
        customPlugins.find((plugin) => plugin.id === id);
      return meta?.name ?? id;
    });
  }, [selectedEntry, pluginMetas, customPlugins]);

  const currentHits = article
    ? articleIndex.get(article.ref.href)?.hitCount ?? 0
    : 0;

  const searchCount = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle || !article) return 0;
    const haystack = article.plainText.toLowerCase();
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index >= 0) {
      count += 1;
      index = haystack.indexOf(needle, index + needle.length);
    }
    return count;
  }, [searchQuery, article]);

  const toggleSaved = () => {
    if (!selected) return;
    const { lemma } = selected;

    if (wordbook[lemma]) {
      setWordbook((current) => removeWord(current, lemma));
      showToast(`已从生词本移除 · ${lemma}`);
      return;
    }

    const hit = lookup(index, lemma);
    const entry: WordEntry = {
      lemma,
      surface: selected.surface,
      phonetic: hit?.entry.usphone ?? hit?.entry.ukphone,
      trans: hit?.entry.trans ?? [],
      lists: hit?.lists ?? [],
      sentence: selected.sentence,
      bookId: book?.bookId,
      bookTitle: book?.title,
      section: article?.ref.sectionTitle,
      articleId: article?.ref.href,
      articleTitle: article?.ref.title,
      addedAt: Date.now(),
    };

    setWordbook((current) => addWord(current, entry));
    setKnown((current) => {
      if (!current.has(lemma)) return current;
      const next = new Set(current);
      next.delete(lemma);
      return next;
    });
    showToast(`已加入生词本 · ${lemma}`);
  };

  const toggleSelectedKnown = () => {
    if (!selected) return;
    setKnown((current) => toggleKnown(current, selected.lemma));
  };

  const speakSelected = () => {
    const target = selected?.surface || selectedEntry?.lemma || selected?.lemma;
    if (!target) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(target);
      utter.lang = "en-US";
      window.speechSynthesis.speak(utter);
    }
  };

  const removeWords = (lemmas: string[]) => {
    setWordbook((current) => {
      let next = current;
      for (const lemma of lemmas) next = removeWord(next, lemma);
      return next;
    });
    showToast(`已删除 ${lemmas.length} 个词`);
  };

  const restoreKnown = (lemma: string) => {
    setKnown((current) => toggleKnown(current, lemma));
    showToast(`已撤销「认识」标记 · ${lemma}`);
  };

  const exportAnki = (entries?: WordEntry[]) => {
    const list = (entries ?? Object.values(wordbook)).sort(
      (a, b) => a.addedAt - b.addedAt,
    );
    if (!list.length) {
      showToast("生词本还是空的");
      return;
    }
    downloadText(ankiFileName(), toAnkiTsv(list));
    showToast(`已导出 ${list.length} 个词 · Anki TSV`);
  };

  const downloadArticle = () => {
    if (!article) {
      showToast("先打开一篇文章");
      return;
    }
    const text = [
      article.ref.title,
      article.ref.sectionTitle,
      "",
      article.rubric ?? "",
      "",
      article.plainText,
    ].join("\n");
    const safeName =
      article.ref.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "article";
    downloadText(`${safeName}.txt`, text, "text/plain;charset=utf-8");
    showToast("已导出当前文章");
  };

  const togglePlugin = (id: string) => {
    const has = enabled.has(id);
    setSettings((current) => ({
      ...current,
      enabledPlugins: has
        ? current.enabledPlugins.filter((item) => item !== id)
        : [...current.enabledPlugins, id],
    }));
    if (!has) {
      const meta = pluginMetas.find((item) => item.id === id);
      if (meta) void ensureEntries(meta);
    }
  };

  const addCustomPlugin = (
    name: string,
    entries: WordListEntry[],
    fileName: string,
  ) => {
    const plugin: CustomPlugin = {
      id: `custom-${Date.now()}`,
      name,
      type: "wordlist",
      description: `导入自 ${fileName}`,
      wordCount: entries.length,
      matchableCount: entries.filter((entry) => !/\s/.test(entry.name)).length,
      source: "本地导入",
      license: "用户导入",
      file: "",
      custom: true,
      entries,
    };
    const next = [...customPlugins, plugin];
    setCustomPlugins(next);
    saveCustomPlugins(next);
    setEntriesById((current) => ({ ...current, [plugin.id]: entries }));
    setSettings((current) => ({
      ...current,
      enabledPlugins: [...current.enabledPlugins, plugin.id],
    }));
    showToast(`已导入词表 · ${entries.length} 条`);
  };

  const addBookmark = () => {
    if (!book || !article) return;
    if (
      bookmarks.some(
        (mark) =>
          mark.bookId === book.bookId && mark.articleId === article.ref.href,
      )
    ) {
      showToast("这篇文章已经加过书签");
      return;
    }
    setBookmarks((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        bookId: book.bookId,
        bookTitle: book.title,
        section: article.ref.sectionTitle,
        articleId: article.ref.href,
        articleTitle: article.ref.title,
        createdAt: Date.now(),
      },
      ...current,
    ]);
    showToast("已加书签");
  };

  const openBookmark = (mark: BookmarkType) => {
    if (book?.bookId === mark.bookId && source) {
      const ref = allRefs.find((item) => item.href === mark.articleId);
      if (ref) {
        void showArticle(source, ref);
        return;
      }
    }
    void (async () => {
      const record = await getBook(mark.bookId).catch(() => null);
      if (!record) {
        showToast("找不到这本书，可能已被移除");
        return;
      }
      await openData(record.bytes, record.fileName, {
        articleId: mark.articleId,
      });
    })();
  };

  const removeBookmark = (id: string) => {
    setBookmarks((current) => current.filter((mark) => mark.id !== id));
  };

  const handleScrollTop = (top: number) => {
    if (!book || !article) return;
    const bookId = book.bookId;
    const articleId = article.ref.href;
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      void updateBookPosition(bookId, articleId, top, {
        articleIndex: currentIndex,
        articleCount: allRefs.length,
      });
    }, 800);
  };

  const pluginManager = pluginsOpen ? (
    <PluginManager
      metas={pluginMetas}
      custom={customPlugins}
      enabled={enabled}
      entries={entriesById}
      onToggle={togglePlugin}
      onLoadEntries={(id) => {
        const meta = pluginMetas.find((item) => item.id === id);
        if (meta) void ensureEntries(meta);
      }}
      onAddCustom={addCustomPlugin}
      onClose={() => setPluginsOpen(false)}
    />
  ) : null;

  const updateSettingsPatch = (patch: Partial<Settings>) => {
    if (patch.filterBasic !== undefined) setFilterBasic(patch.filterBasic);
    if (patch.warm !== undefined) setWarm(patch.warm);
    if (patch.light !== undefined) setLight(patch.light);
    setSettings((current) => ({ ...current, ...patch }));
  };

  const resetSettingsDefaults = () => {
    setWarm(false);
    setLight(false);
    setDarkTheme(DEFAULT_DARK_THEME);
    setLightTheme(DEFAULT_LIGHT_THEME);
    setFilterBasic(true);
    setSettings((current) => ({
      ...current,
      warm: false,
      light: false,
      darkTheme: DEFAULT_DARK_THEME,
      lightTheme: DEFAULT_LIGHT_THEME,
      filterBasic: true,
      fontFamily: "lora",
      fontSize: 18,
      lineHeight: 1.75,
      readerWidth: 744,
      clickLookup: true,
      autoSpeak: false,
      autoSaveWord: false,
      autoSync: true,
    }));
    showToast("已恢复默认设置");
  };

  const toastNode = toast ? <div className="toast">{toast}</div> : null;
  const appClass = `app ${warm ? "warm" : ""} ${light ? "light" : ""} ${themed ? "themed" : ""}`;

  if (vocabOpen) {
    return (
      <div className={appClass}>
        <VocabularyPage
          wordbook={wordbook}
          known={known}
          settings={settings}
          light={light}
          onToggleKnown={(lemma) => setKnown((c) => toggleKnown(c, lemma))}
          onRemoveWord={(lemma) => {
            setWordbook((c) => removeWord(c, lemma));
            showToast(`已删除生词 · ${lemma}`);
          }}
          onToggleLight={toggleLight}
          onBackToShelf={() => setVocabOpen(false)}
          onOpenSettings={() => {
            setVocabOpen(false);
            setSettingsOpen(true);
          }}
          onNavigateToArticle={async (bId, artId) => {
            setVocabOpen(false);
            if (book?.bookId !== bId) {
              const rec = await getBook(bId).catch(() => null);
              if (rec) {
                await openData(rec.bytes, rec.fileName, { articleId: artId });
              }
            } else if (source) {
              const ref = allRefs.find((r) => r.href === artId);
              if (ref) void showArticle(source, ref);
            }
          }}
          onUpdateDeck={(deck) =>
            setSettings((current) => ({ ...current, ankiDeck: deck }))
          }
          onToast={showToast}
        />
        {toastNode}
      </div>
    );
  }

  if (settingsOpen) {
    return (
      <div className={appClass}>
        <SettingsPage
          settings={{ ...settings, filterBasic, warm, light }}
          wordbook={wordbook}
          activeTheme={activeThemeKey}
          light={light}
          warm={warm}
          onUpdate={updateSettingsPatch}
          onPickTheme={pickTheme}
          onToggleLight={toggleLight}
          onToggleWarm={toggleWarm}
          onOpenPlugins={() => setPluginsOpen(true)}
          onResetDefaults={resetSettingsDefaults}
          onBackToShelf={() => {
            setSettingsOpen(false);
            if (book) closeBook();
          }}
          onOpenVocab={() => {
            setSettingsOpen(false);
            setVocabOpen(true);
          }}
          onBackToReader={book ? () => setSettingsOpen(false) : undefined}
          onToast={showToast}
        />
        {pluginManager}
        {toastNode}
      </div>
    );
  }

  if (!book) {
    return (
      <div className={appClass}>
        <Bookshelf
          books={recent}
          busy={busy}
          light={light}
          wordbook={wordbook}
          known={known}
          bookmarks={bookmarks}
          onImport={(file) => {
            void openFile(file);
          }}
          onOpen={openRecent}
          onDelete={removeShelfBook}
          onOpenPlugins={() => setPluginsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenVocab={() => setVocabOpen(true)}
          onToggleLight={toggleLight}
          onToast={showToast}
        />
        {error ? (
          <div className="error-banner">
            <span>{error}</span>
            <button
              className="icon-button small"
              type="button"
              title="关闭"
              onClick={() => setError(null)}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
        ) : null}
        {pluginManager}
        {toastNode}
      </div>
    );
  }

  return (
    <div className={appClass}>
      <Toolbar
        fileName={book.title}
        position={
          currentIndex >= 0
            ? { index: currentIndex, total: allRefs.length }
            : null
        }
        zoom={zoom}
        light={light}
        leftPinned={leftPinned}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        searchCount={searchCount}
        onToggleLeft={() => setLeftPinned((value) => !value)}
        onOpenFile={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".epub";
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) void openFile(file);
          };
          input.click();
        }}
        onPrevArticle={() => goRelative(-1)}
        onNextArticle={() => goRelative(1)}
        onZoomChange={(next) => {
          setAutoFit(false);
          setZoom(Math.min(240, Math.max(40, next)));
        }}
        onFitWidth={() => {
          const next = fitZoom();
          setAutoFit(true);
          setZoom(next);
          showToast(`已适合宽度 · ${next}%`);
        }}
        onToggleLight={toggleLight}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenVocab={() => setVocabOpen(true)}
        onToggleSearch={toggleSearch}
        onSearchQuery={setSearchQuery}
        onSearchJump={() => {
          if (searchQuery.trim()) setJumpSignal((value) => value + 1);
        }}
        onBackToShelf={closeBook}
        onExportAnki={() => exportAnki()}
        onDownloadArticle={downloadArticle}
        onToast={showToast}
      />

      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button
            className="icon-button small"
            type="button"
            title="关闭"
            onClick={() => setError(null)}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      ) : null}

      <div className="stage">
        <Reader
          article={article}
          html={articleHtml}
          zoom={zoom}
          selectedWord={selected?.lemma ?? null}
          searchQuery={searchQuery}
          jumpSignal={jumpSignal}
          initialScrollTop={restoreScroll}
          onPickWord={pickWord}
          onScrollTop={handleScrollTop}
        />

        <div
          className={`float-zone left${leftVisible ? " open" : ""}`}
          onMouseEnter={() => setLeftHover(true)}
          onMouseLeave={() => setLeftHover(false)}
        >
          <span className="float-rail" aria-hidden="true" />
          <OutlinePanel
            tab={tab}
            onTab={setTab}
            query={query}
            onQuery={setQuery}
            book={book}
            currentHref={article?.ref.href ?? null}
            onOpenArticle={openArticle}
            articleIndex={articleIndex}
            indexing={indexing}
            wordbook={wordbook}
            known={known}
            onSelectWord={selectKnownWord}
            onRemoveWords={removeWords}
            onRestoreKnown={restoreKnown}
            bookmarks={bookmarks}
            canBookmark={Boolean(book && article)}
            onAddBookmark={addBookmark}
            onOpenBookmark={openBookmark}
            onRemoveBookmark={removeBookmark}
            onExportWords={exportAnki}
            onClose={() => {
              setLeftPinned(false);
              setLeftHover(false);
            }}
          />
        </div>

        <div
          className={`float-zone right${rightVisible ? " open" : ""}`}
          onMouseEnter={() => setRightHover(true)}
          onMouseLeave={() => setRightHover(false)}
        >
          <span className="float-rail right" aria-hidden="true" />
          <WordPanel
            selected={selected}
            entry={selectedEntry}
            listNames={listNames}
            phonetic={selectedEntry?.entry.usphone ?? undefined}
            sentence={selected?.sentence}
            basic={selected ? basicSet.has(selected.lemma) : false}
            known={selectedKnown}
            saved={selectedSaved}
            hits={currentHits}
            pinned={rightPinned}
            onTogglePin={toggleRightPinned}
            onClose={() => setRightOpen(false)}
            onToggleSaved={toggleSaved}
            onToggleKnown={toggleSelectedKnown}
            onSpeak={speakSelected}
            onToast={showToast}
          />
        </div>
      </div>

      {pluginManager}
      {toastNode}
    </div>
  );
}

function toggleSearch() {}

export default App;
