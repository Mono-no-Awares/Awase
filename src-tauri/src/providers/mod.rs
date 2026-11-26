pub mod soundcloud;
pub mod spotify;
pub mod yandex;

use std::path::PathBuf;
use reqwest::Client;

pub fn build_http_client() -> Client {
    Client::builder()
        .user_agent("Yandex-Music-API")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| Client::new())
}

pub async fn download_to_cache(
    client: &Client,
    cache_dir: &PathBuf,
    cache_key: &str,
    ext: &str,
    url: &str,
    bearer_token: Option<&str>,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let safe_key: String = cache_key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    let target = cache_dir.join(format!("{}.{}", safe_key, ext));
    if target.exists() {
        if let Ok(meta) = std::fs::metadata(&target) {
            if meta.len() > 4096 {
                return Ok(target);
            }
        }
    }

    let mut req = client.get(url);
    if let Some(tok) = bearer_token {
        req = req.bearer_auth(tok);
    }
    let resp = req.send().await.map_err(|e| format!("Stream request failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Stream HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Stream read failed: {}", e))?;
    if bytes.len() < 1024 {
        return Err("Stream payload empty or blocked".to_string());
    }
    let tmp_path = cache_dir.join(format!("{}.{}.part", safe_key, std::process::id()));
    std::fs::write(&tmp_path, &bytes).map_err(|e| e.to_string())?;
    let _ = std::fs::rename(&tmp_path, &target);
    if !target.exists() {
        std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    }
    Ok(target)
}
