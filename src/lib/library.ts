import { invoke } from "@tauri-apps/api/core";

/**
 * 书库文件（桌面端）：每本 epub 以内容 SHA-256 命名存放在应用数据目录下，
 * 同一本书重复导入不会产生第二份文件。
 *
 * ```text
 * <应用数据目录>/library/
 *   books/<sha256>.epub
 *   library.json
 * ```
 *
 * 浏览器预览没有这个能力，所有函数都返回空值，调用方自行降级到 IndexedDB。
 */
export type LibraryBook = {
  hash: string;
  title: string;
  fileName: string;
  size: number;
  importedAt: number;
};

export type SavedBookFile = {
  hash: string;
  path: string;
  size: number;
  /** 库里已有同内容文件时为 true，本次未重复写入。 */
  existed: boolean;
};

export function libraryAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function libraryRoot(): Promise<string | null> {
  if (!libraryAvailable()) return null;
  try {
    return await invoke<string>("library_root_path");
  } catch {
    return null;
  }
}

/**
 * 把一本书写进书库。文件名由后端按内容计算 SHA-256 决定，
 * 因此同一内容只会有一份文件，也不需要前端相信自己的哈希。
 */
export async function saveBookFile(
  bytes: ArrayBuffer,
  fileName: string,
  title: string,
): Promise<SavedBookFile | null> {
  if (!libraryAvailable() || bytes.byteLength === 0) return null;
  try {
    return await invoke<SavedBookFile>("save_book", {
      bytesBase64: toBase64(new Uint8Array(bytes)),
      fileName,
      title,
    });
  } catch {
    // 书库写盘失败不应影响本次阅读，IndexedDB 里还有一份。
    return null;
  }
}

export async function listLibrary(): Promise<LibraryBook[]> {
  if (!libraryAvailable()) return [];
  try {
    return await invoke<LibraryBook[]>("list_library");
  } catch {
    return [];
  }
}

export async function readBookFile(hash: string): Promise<ArrayBuffer | null> {
  if (!libraryAvailable()) return null;
  try {
    return await invoke<ArrayBuffer>("read_book", { hash });
  } catch {
    return null;
  }
}

export async function removeBookFile(hash: string): Promise<boolean> {
  if (!libraryAvailable()) return false;
  try {
    await invoke("remove_book", { hash });
    return true;
  } catch {
    return false;
  }
}
