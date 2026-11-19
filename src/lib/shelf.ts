import type { StoredBook } from "./store";
import { listBooks } from "./store";
import type { LibraryBook } from "./library";
import { listLibrary } from "./library";

/**
 * 合并两个来源的书架条目：
 * - IndexedDB（浏览器和桌面端都有）：完整的阅读进度与原文缓存；
 * - 磁盘书库（仅桌面端）：以内容哈希为准的持久文件。
 *
 * 同一个 hash 只保留一条，优先用 IndexedDB 里更完整的记录；
 * 只在磁盘上存在的书补一条 `bytes` 为空的占位记录，打开时再去读文件。
 */
export function mergeShelf(
  local: StoredBook[],
  disk: LibraryBook[],
): StoredBook[] {
  const byId = new Map<string, StoredBook>();
  for (const book of local) byId.set(book.bookId, book);

  for (const entry of disk) {
    const existing = byId.get(entry.hash);
    if (existing) {
      // IndexedDB 里没有标题时用清单里的标题补上
      if (!existing.title) byId.set(entry.hash, { ...existing, title: entry.title });
      continue;
    }
    byId.set(entry.hash, {
      bookId: entry.hash,
      fileName: entry.fileName,
      title: entry.title,
      bytes: new ArrayBuffer(0),
      savedAt: entry.importedAt || Date.now(),
    });
  }

  return [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
}

/** 读出当前书架：IndexedDB + 磁盘书库。 */
export async function loadShelf(): Promise<StoredBook[]> {
  const [local, disk] = await Promise.all([
    listBooks().catch(() => [] as StoredBook[]),
    listLibrary().catch(() => [] as LibraryBook[]),
  ]);
  return mergeShelf(local, disk);
}
