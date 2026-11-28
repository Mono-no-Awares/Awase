pub mod soundcloud;
pub mod spotify;
pub mod yandex;

use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use parking_lot::Mutex;
use reqwest::Client;
use tokio::sync::watch;

type InFlightTx = watch::Sender<Option<Result<PathBuf, String>>>;
static IN_FLIGHT: OnceLock<Mutex<HashMap<String, InFlightTx>>> = OnceLock::new();

pub fn build_http_client() -> Client {
    Client::builder()
        .user_agent("Yandex-Music-API")
        .tcp_nodelay(true)
        .pool_max_idle_per_host(24)
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .connect_timeout(std::time::Duration::from_secs(6))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| Client::new())
}

pub fn sanitize_cache_key(key: &str) -> String {
    key.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}

pub fn find_cached_track(cache_dir: &Path, cache_key: &str) -> Option<PathBuf> {
    let safe_key = sanitize_cache_key(cache_key);
    for ext in ["mp3", "m4a", "aac", "flac", "ogg"] {
        let p = cache_dir.join(format!("{}.{}", safe_key, ext));
        if let Ok(meta) = std::fs::metadata(&p) {
            if meta.len() > 4096 {
                return Some(p);
            }
        }
    }
    None
}

pub async fn run_dedup_download<F>(key: &str, fut: F) -> Result<PathBuf, String>
where
    F: Future<Output = Result<PathBuf, String>>,
{
    let map = IN_FLIGHT.get_or_init(|| Mutex::new(HashMap::new()));
    let existing_rx = {
        let guard = map.lock();
        guard.get(key).map(|tx| tx.subscribe())
    };

    if let Some(mut rx) = existing_rx {
        loop {
            if let Some(res) = rx.borrow().clone() {
                return res;
            }
            if rx.changed().await.is_err() {
                break;
            }
        }
    }

    let (tx, _rx) = watch::channel(None);
    {
        let mut guard = map.lock();
        guard.insert(key.to_string(), tx.clone());
    }

    let res = fut.await;
    let _ = tx.send(Some(res.clone()));
    {
        let mut guard = map.lock();
        guard.remove(key);
    }
    res
}

pub fn parse_iso_timestamp(s: &str) -> Option<i64> {
    let bytes = s.as_bytes();
    if bytes.len() < 19 || bytes[4] != b'-' || bytes[7] != b'-' || (bytes[10] != b'T' && bytes[10] != b' ') {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let min: i64 = s.get(14..16)?.parse().ok()?;
    let sec: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let y = if month <= 2 { year - 1 } else { year };
    let m = if month <= 2 { month + 9 } else { month - 3 };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * m + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + hour * 3_600 + min * 60 + sec)
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
