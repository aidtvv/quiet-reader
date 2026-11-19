import type {
  Bookmark,
  PluginMeta,
  Settings,
  WordEntry,
  WordListEntry,
} from "../types";

export const STORAGE_KEYS = {
  wordbook: "qr.wordbook.v1",
  known: "qr.known.v1",
  bookmarks: "qr.bookmarks.v1",
  settings: "qr.settings.v1",
  customPlugins: "qr.customPlugins.v1",
} as const;

export type CustomPlugin = PluginMeta & {
  entries: WordListEntry[];
  custom: true;
};

export const DEFAULT_SETTINGS: Settings = {
  enabledPlugins: [],
  pluginsInitialized: false,
  zoom: 100,
  autoFit: true,
  warm: false,
  light: false,
  darkTheme: "quiet-dark",
  lightTheme: "quiet-light",
  filterBasic: true,
  fontFamily: "lora",
  fontSize: 18,
  lineHeight: 1.75,
  readerWidth: 744,
  clickLookup: true,
  autoSpeak: false,
  autoSaveWord: false,
  autoSync: true,
  ankiConnectEnabled: false,
  ankiConnectUrl: "http://127.0.0.1:8765",
  ankiDeck: "考研英语词汇::单词::生词组",
  ankiReuseExisting: true,
  ankiSourceDeck: "考研英语词汇",
  lastArticleByBook: {},
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: settings are best-effort.
  }
}

export function loadSettings(): Settings {
  const stored = read<Partial<Settings>>(STORAGE_KEYS.settings, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    enabledPlugins: Array.isArray(stored.enabledPlugins)
      ? stored.enabledPlugins
      : [],
    lastArticleByBook:
      stored.lastArticleByBook && typeof stored.lastArticleByBook === "object"
        ? stored.lastArticleByBook
        : {},
  };
}

export function saveSettings(settings: Settings): void {
  write(STORAGE_KEYS.settings, settings);
}

export function loadWordbook(): Record<string, WordEntry> {
  const stored = read<Record<string, WordEntry>>(STORAGE_KEYS.wordbook, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveWordbook(wordbook: Record<string, WordEntry>): void {
  write(STORAGE_KEYS.wordbook, wordbook);
}

export function loadKnown(): Set<string> {
  const stored = read<string[]>(STORAGE_KEYS.known, []);
  return new Set(Array.isArray(stored) ? stored : []);
}

export function saveKnown(known: Set<string>): void {
  write(STORAGE_KEYS.known, [...known]);
}

export function loadBookmarks(): Bookmark[] {
  const stored = read<Bookmark[]>(STORAGE_KEYS.bookmarks, []);
  return Array.isArray(stored) ? stored : [];
}

export function saveBookmarks(bookmarks: Bookmark[]): void {
  write(STORAGE_KEYS.bookmarks, bookmarks);
}

export function loadCustomPlugins(): CustomPlugin[] {
  const stored = read<CustomPlugin[]>(STORAGE_KEYS.customPlugins, []);
  return Array.isArray(stored) ? stored : [];
}

export function saveCustomPlugins(plugins: CustomPlugin[]): void {
  write(STORAGE_KEYS.customPlugins, plugins);
}

export type StoredBook = {
  bookId: string;
  fileName: string;
  title: string;
  issueDate?: string;
  bytes: ArrayBuffer;
  savedAt: number;
  lastArticleId?: string;
  scrollTop?: number;
  articleCount?: number;
  lastArticleIndex?: number;
  lastOpenedAt?: number;
};

const DB_NAME = "qr-books";
const DB_VERSION = 1;
const BOOK_STORE = "books";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: "bookId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBook(record: StoredBook): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BOOK_STORE, "readwrite");
  tx.objectStore(BOOK_STORE).put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await pruneBooks();
}

export async function listBooks(): Promise<StoredBook[]> {
  const db = await openDb();
  const tx = db.transaction(BOOK_STORE, "readonly");
  const records = await requestToPromise(
    tx.objectStore(BOOK_STORE).getAll() as IDBRequest<StoredBook[]>,
  );
  return records.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getBook(bookId: string): Promise<StoredBook | null> {
  const db = await openDb();
  const tx = db.transaction(BOOK_STORE, "readonly");
  const record = await requestToPromise(
    tx.objectStore(BOOK_STORE).get(bookId) as IDBRequest<
      StoredBook | undefined
    >,
  );
  return record ?? null;
}

export async function updateBookPosition(
  bookId: string,
  articleId: string,
  scrollTop: number,
  meta?: { articleIndex?: number; articleCount?: number },
): Promise<void> {
  const record = await getBook(bookId);
  if (!record) return;
  const db = await openDb();
  const tx = db.transaction(BOOK_STORE, "readwrite");
  tx.objectStore(BOOK_STORE).put({
    ...record,
    lastArticleId: articleId,
    scrollTop,
    lastArticleIndex: meta?.articleIndex ?? record.lastArticleIndex,
    articleCount: meta?.articleCount ?? record.articleCount,
    lastOpenedAt: Date.now(),
  });
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BOOK_STORE, "readwrite");
  tx.objectStore(BOOK_STORE).delete(bookId);
}

export async function pruneBooks(max = 24): Promise<void> {
  const books = await listBooks();
  if (books.length <= max) return;
  const db = await openDb();
  const tx = db.transaction(BOOK_STORE, "readwrite");
  for (const book of books.slice(max)) {
    tx.objectStore(BOOK_STORE).delete(book.bookId);
  }
}
