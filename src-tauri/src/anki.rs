use serde_json::{json, Value};

/// 代理 AnkiConnect 请求。
///
/// 浏览器里的 fetch 会被 AnkiConnect 的 CORS 白名单拦下（默认只允许
/// `http://localhost`，Tauri 的 `tauri.localhost` 也不在名单里），
/// 因此桌面端统一走 Rust 侧转发，无需用户改 AnkiConnect 配置。
#[tauri::command]
pub async fn anki_invoke(
    action: String,
    params: Option<Value>,
    url: Option<String>,
) -> Result<Value, String> {
    let endpoint = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| "http://127.0.0.1:8765".to_string());

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let body = json!({
        "action": action,
        "version": 6,
        "params": params.unwrap_or_else(|| json!({})),
    });

    let resp = client
        .post(&endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("无法连接 AnkiConnect（{endpoint}）：{e}"))?;

    if !resp.status().is_success() {
        return Err(format!("AnkiConnect 返回 HTTP {}", resp.status()));
    }

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(err) = json.get("error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }

    Ok(json.get("result").cloned().unwrap_or(Value::Null))
}
