//! 书库文件管理：把导入的 epub 以内容哈希落盘，保证同一本书只有一份。
//!
//! 目录结构（位于系统的应用数据目录下，可在设置里查看完整路径）：
//!
//! ```text
//! library/
//!   books/
//!     <sha256>.epub      # 文件名就是内容的 SHA-256，同名即同书
//!   library.json         # 清单：哈希 → 标题、原始文件名、大小、导入时间
//! ```
//!
//! 清单是给人看/可手改的：删掉也不会丢数据，下次列出时会按目录里的文件重建。

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BookRecord {
    /// 内容的 SHA-256（小写十六进制），同时也是磁盘上的文件名。
    pub hash: String,
    pub title: String,
    /// 导入时的原始文件名，仅用于展示。
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub size: u64,
    /// 导入时间（毫秒时间戳）。
    #[serde(rename = "importedAt")]
    pub imported_at: i64,
}

#[derive(Serialize, Deserialize, Default)]
struct Manifest {
    version: u32,
    books: Vec<BookRecord>,
}

#[derive(Serialize)]
pub struct SavedBook {
    pub hash: String,
    pub path: String,
    pub size: u64,
    /// true 表示库里已经有同内容的文件，本次没有重复写入。
    pub existed: bool,
    pub title: String,
}

fn library_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录：{e}"))?
        .join("library");
    fs::create_dir_all(dir.join("books")).map_err(|e| format!("无法创建书库目录：{e}"))?;
    Ok(dir)
}

fn manifest_path(root: &Path) -> PathBuf {
    root.join("library.json")
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// 校验哈希，顺便挡住 `../` 之类的路径穿越。
fn is_valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
}

fn read_manifest(root: &Path) -> Manifest {
    let path = manifest_path(root);
    let Ok(raw) = fs::read_to_string(&path) else {
        return Manifest {
            version: 1,
            books: Vec::new(),
        };
    };
    match serde_json::from_str::<Manifest>(&raw) {
        Ok(manifest) => manifest,
        // 清单损坏时不让书库失效：按目录重建。
        Err(_) => Manifest {
            version: 1,
            books: Vec::new(),
        },
    }
}

fn write_manifest(root: &Path, manifest: &Manifest) -> Result<(), String> {
    let path = manifest_path(root);
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("无法写入清单：{e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("无法保存清单：{e}"))
}

/// 扫描 books/ 目录，把清单里没有的文件补进去（文件名就是哈希）。
fn sync_with_dir(root: &Path, manifest: &mut Manifest) -> bool {
    let Ok(entries) = fs::read_dir(root.join("books")) else {
        return false;
    };
    let mut changed = false;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("epub") {
            continue;
        }
        let Some(hash) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !is_valid_hash(hash) || manifest.books.iter().any(|b| b.hash == hash) {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        manifest.books.push(BookRecord {
            hash: hash.to_string(),
            title: hash[..8].to_string(),
            file_name: format!("{hash}.epub"),
            size,
            imported_at: 0,
        });
        changed = true;
    }
    changed
}

fn sorted(mut books: Vec<BookRecord>) -> Vec<BookRecord> {
    books.sort_by(|a, b| b.imported_at.cmp(&a.imported_at));
    books
}

#[tauri::command]
pub fn library_root_path(app: AppHandle) -> Result<String, String> {
    Ok(library_root(&app)?.to_string_lossy().to_string())
}

/// `bytes_base64` 是文件内容的 base64：Tauri 的 JSON 通道不适合直接传大数组。
#[tauri::command]
pub async fn save_book(
    app: AppHandle,
    bytes_base64: String,
    file_name: String,
    title: String,
) -> Result<SavedBook, String> {
    let root = library_root(&app)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes_base64.as_bytes())
        .map_err(|e| format!("文件内容解码失败：{e}"))?;
    if bytes.is_empty() {
        return Err("文件内容为空".into());
    }

    let hash = sha256_hex(&bytes);
    let target = root.join("books").join(format!("{hash}.epub"));
    let existed = target.exists();
    if !existed {
        let tmp = target.with_extension("epub.tmp");
        fs::write(&tmp, &bytes).map_err(|e| format!("无法写入书库：{e}"))?;
        fs::rename(&tmp, &target).map_err(|e| format!("无法保存到书库：{e}"))?;
    }

    let mut manifest = read_manifest(&root);
    sync_with_dir(&root, &mut manifest);
    match manifest.books.iter_mut().find(|b| b.hash == hash) {
        Some(record) => {
            // 同一内容再次导入：只补齐更有信息量的元数据。
            if record.title.is_empty() || record.title.len() == 8 {
                record.title = title.clone();
            }
            if record.file_name.ends_with(".epub") && record.imported_at == 0 {
                record.file_name = file_name.clone();
                record.imported_at = now_ms();
            }
        }
        None => manifest.books.push(BookRecord {
            hash: hash.clone(),
            title,
            file_name,
            size: bytes.len() as u64,
            imported_at: now_ms(),
        }),
    }
    manifest.version = 1;
    write_manifest(&root, &manifest)?;

    let saved_title = manifest
        .books
        .iter()
        .find(|b| b.hash == hash)
        .map(|b| b.title.clone())
        .unwrap_or_default();

    Ok(SavedBook {
        hash,
        path: target.to_string_lossy().to_string(),
        size: bytes.len() as u64,
        existed,
        title: saved_title,
    })
}

#[tauri::command]
pub async fn list_library(app: AppHandle) -> Result<Vec<BookRecord>, String> {
    let root = library_root(&app)?;
    let mut manifest = read_manifest(&root);
    if sync_with_dir(&root, &mut manifest) {
        let _ = write_manifest(&root, &manifest);
    }
    Ok(sorted(manifest.books))
}

#[tauri::command]
pub async fn read_book(app: AppHandle, hash: String) -> Result<Response, String> {
    if !is_valid_hash(&hash) {
        return Err(format!("非法的哈希：{hash}"));
    }
    let path = library_root(&app)?.join("books").join(format!("{hash}.epub"));
    let bytes = fs::read(&path).map_err(|e| format!("读取失败：{e}"))?;
    // 内容与文件名必须一致，防止文件被替换后继续用旧索引。
    if sha256_hex(&bytes) != hash {
        return Err("书库文件内容与其哈希不符，可能已被修改或损坏".into());
    }
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn remove_book(app: AppHandle, hash: String) -> Result<(), String> {
    if !is_valid_hash(&hash) {
        return Err(format!("非法的哈希：{hash}"));
    }
    let root = library_root(&app)?;
    let path = root.join("books").join(format!("{hash}.epub"));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("删除失败：{e}"))?;
    }
    let mut manifest = read_manifest(&root);
    let before = manifest.books.len();
    manifest.books.retain(|b| b.hash != hash);
    if manifest.books.len() != before {
        write_manifest(&root, &manifest)?;
    }
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_stable_and_sixty_four_hex() {
        let hash = sha256_hex(b"quiet-reader");
        assert_eq!(hash.len(), 64);
        assert_eq!(hash, sha256_hex(b"quiet-reader"));
        assert_ne!(hash, sha256_hex(b"quiet-reader "));
        assert!(is_valid_hash(&hash));
    }

    #[test]
    fn rejects_path_traversal() {
        assert!(!is_valid_hash("../secrets"));
        assert!(!is_valid_hash(&"z".repeat(64)));
        assert!(!is_valid_hash(""));
    }
}
