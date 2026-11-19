use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedWord {
    pub word: String,
    pub pos: String,
    pub tran: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoritativeMeaning {
    pub pos: String,
    pub tran: String,
    pub def_en: Option<String>,
    pub example: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoritativeDictResult {
    pub word: String,
    pub source: String,
    pub phonetic: Option<String>,
    pub etymology: Option<String>,
    pub meanings: Vec<AuthoritativeMeaning>,
    pub derivatives: Vec<RelatedWord>,
    pub synonyms: Vec<String>,
}

fn cache_path(app: &AppHandle, word: &str) -> Option<PathBuf> {
    let dir = app.path().app_cache_dir().ok()?.join("dict_cache");
    let safe: String = word
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if safe.is_empty() {
        return None;
    }
    Some(dir.join(format!("{safe}.json")))
}

fn read_cache(app: &AppHandle, word: &str) -> Option<AuthoritativeDictResult> {
    let path = cache_path(app, word)?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_cache(app: &AppHandle, word: &str, data: &AuthoritativeDictResult) {
    if let Some(path) = cache_path(app, word) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(data) {
            let _ = fs::write(path, json);
        }
    }
}

fn parse_youdao(word: &str, root: &Value) -> Option<AuthoritativeDictResult> {
    let mut meanings = Vec::new();
    let mut derivatives = Vec::new();
    let mut synonyms = Vec::new();
    let mut etymology = None;
    let mut phonetic = None;

    if let Some(simple_word) = root.pointer("/simple/word/0") {
        phonetic = simple_word
            .get("usphone")
            .or_else(|| simple_word.get("ukphone"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| format!("/{s}/"));
    }

    // 柯林斯权威双解
    if let Some(entries) = root.pointer("/collins/collins_entries/0/entries/entry").and_then(|v| v.as_array()) {
        for item in entries.iter().take(4) {
            let pos = item
                .pointer("/tran_entry/0/pos_entry/pos")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tran = item
                .pointer("/tran_entry/0/tran")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .replace("<b>", "")
                .replace("</b>", "");
            let example = item
                .pointer("/tran_entry/0/exam_sents/sent/0/eng_sent")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if !tran.is_empty() {
                meanings.push(AuthoritativeMeaning {
                    pos,
                    tran,
                    def_en: None,
                    example,
                });
            }
        }
    }

    // 派生词 / 同根词
    if let Some(rels) = root.pointer("/rel_word/rels").and_then(|v| v.as_array()) {
        for rel in rels {
            let pos = rel
                .pointer("/rel/pos")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(words) = rel.pointer("/rel/words").and_then(|v| v.as_array()) {
                for w in words {
                    let rw = w.get("word").and_then(|v| v.as_str()).unwrap_or("").trim();
                    let rt = w.get("tran").and_then(|v| v.as_str()).unwrap_or("").trim();
                    if !rw.is_empty() && rw.to_lowercase() != word {
                        derivatives.push(RelatedWord {
                            word: rw.to_string(),
                            pos: pos.clone(),
                            tran: rt.to_string(),
                        });
                    }
                }
            }
        }
    }

    // 词源 / 词根
    if let Some(etyms) = root.pointer("/etym/etyms/zh").and_then(|v| v.as_array()) {
        let parts: Vec<String> = etyms
            .iter()
            .filter_map(|e| e.get("value").and_then(|v| v.as_str()))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !parts.is_empty() {
            etymology = Some(parts.join("；"));
        }
    }

    // 同近义词
    if let Some(synos) = root.pointer("/syno/synos").and_then(|v| v.as_array()) {
        for s in synos {
            if let Some(ws) = s.pointer("/syno/ws").and_then(|v| v.as_array()) {
                for w in ws {
                    if let Some(txt) = w.get("w").and_then(|v| v.as_str()) {
                        if !synonyms.contains(&txt.to_string()) && synonyms.len() < 8 {
                            synonyms.push(txt.to_string());
                        }
                    }
                }
            }
        }
    }

    if meanings.is_empty() && derivatives.is_empty() && etymology.is_none() {
        return None;
    }

    Some(AuthoritativeDictResult {
        word: word.to_string(),
        source: "有道 · 柯林斯权威词典".to_string(),
        phonetic,
        etymology,
        meanings,
        derivatives: derivatives.into_iter().take(10).collect(),
        synonyms,
    })
}

#[tauri::command]
pub async fn lookup_authoritative_dict(
    app: AppHandle,
    word: String,
) -> Result<Option<AuthoritativeDictResult>, String> {
    let key = word.trim().to_lowercase();
    if key.is_empty() {
        return Ok(None);
    }

    if let Some(cached) = read_cache(&app, &key) {
        return Ok(Some(cached));
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://dict.youdao.com/jsonapi?q={key}");
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let parsed = parse_youdao(&key, &json);
    if let Some(ref result) = parsed {
        write_cache(&app, &key, result);
    }
    Ok(parsed)
}
