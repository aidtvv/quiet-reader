import { describe, expect, it } from "vitest";
import type { StoredBook } from "./store";
import type { LibraryBook } from "./library";
import { mergeShelf } from "./shelf";

function local(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    bookId: "a".repeat(64),
    fileName: "economist.epub",
    title: "The Economist",
    bytes: new Uint8Array([1, 2, 3]).buffer,
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function disk(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    hash: "a".repeat(64),
    title: "The Economist",
    fileName: "economist.epub",
    size: 3,
    importedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("mergeShelf", () => {
  it("同一个内容哈希只保留一条，以 IndexedDB 记录为准", () => {
    const merged = mergeShelf([local()], [disk()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].bytes.byteLength).toBe(3);
  });

  it("只在磁盘上的书补成占位条目，打开时再读文件", () => {
    const merged = mergeShelf(
      [],
      [disk({ hash: "b".repeat(64), title: "The Atlantic", importedAt: 1 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].bookId).toBe("b".repeat(64));
    expect(merged[0].bytes.byteLength).toBe(0);
    expect(merged[0].title).toBe("The Atlantic");
  });

  it("IndexedDB 缺标题时用清单里的标题补齐", () => {
    const merged = mergeShelf(
      [local({ title: "" })],
      [disk({ title: "The Economist 2026" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("The Economist 2026");
    // 原有字节不能被替换掉
    expect(merged[0].bytes.byteLength).toBe(3);
  });

  it("按最近保存时间倒序排列", () => {
    const merged = mergeShelf(
      [local({ savedAt: 10 })],
      [disk({ hash: "c".repeat(64), importedAt: 99 })],
    );
    expect(merged.map((b) => b.bookId)).toEqual(["c".repeat(64), "a".repeat(64)]);
  });
});
