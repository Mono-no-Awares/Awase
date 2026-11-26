use std::time::{SystemTime, UNIX_EPOCH};
use md5::{Digest, Md5};
use reqwest::Client;
use serde_json::Value;
use crate::models::{Playlist, SourceKind, Track};

const YM_API: &str = "https://api.music.yandex.net";

pub async fn fetch_account_status(client: &Client, token: &str) -> Result<(String, String), String> {
    let resp = client
        .get(format!("{}/account/status", YM_API))
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Yandex auth failed: HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let account = json
        .get("result")
        .and_then(|r| r.get("account"))
        .ok_or_else(|| "Invalid Yandex account payload".to_string())?;

    let uid = account
        .get("uid")
        .and_then(|v| v.as_i64().map(|n| n.to_string()).or_else(|| v.as_str().map(str::to_string)))
        .ok_or_else(|| "Missing Yandex UID".to_string())?;
    let login = account
        .get("displayName")
        .or_else(|| account.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or("Yandex User")
        .to_string();

    Ok((uid, login))
}

pub async fn search_tracks(
    client: &Client,
    token: Option<&str>,
    query: &str,
) -> Result<Vec<Track>, String> {
    let mut req = client.get(format!("{}/search", YM_API)).query(&[
        ("text", query),
        ("page", "0"),
        ("type", "track"),
        ("nocorrect", "false"),
    ]);
    if let Some(tok) = token {
        req = req.header("Authorization", format!("OAuth {}", tok));
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Yandex search HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = json
        .get("result")
        .and_then(|r| r.get("tracks"))
        .and_then(|t| t.get("results"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items.iter().filter_map(|v| parse_track(v, false)).collect())
}

pub async fn sync_library(
    client: &Client,
    token: &str,
) -> Result<(Vec<Track>, Vec<(Playlist, Vec<Track>)>), String> {
    let (uid, _) = fetch_account_status(client, token).await?;

    let likes_resp = client
        .get(format!("{}/users/{}/likes/tracks", YM_API, uid))
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let likes_json: Value = likes_resp.json().await.map_err(|e| e.to_string())?;
    let track_ids: Vec<String> = likes_json
        .get("result")
        .and_then(|r| r.get("library"))
        .and_then(|l| l.get("tracks"))
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    item.get("id").and_then(|v| {
                        v.as_str()
                            .map(str::to_string)
                            .or_else(|| v.as_i64().map(|n| n.to_string()))
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let mut tracks = Vec::new();
    for chunk in track_ids.chunks(150) {
        let joined = chunk.join(",");
        let meta_resp = client
            .post(format!("{}/tracks", YM_API))
            .header("Authorization", format!("OAuth {}", token))
            .form(&[("track-ids", joined.as_str())])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if meta_resp.status().is_success() {
            let meta_json: Value = meta_resp.json().await.map_err(|e| e.to_string())?;
            if let Some(arr) = meta_json.get("result").and_then(|r| r.as_array()) {
                for v in arr {
                    if let Some(t) = parse_track(v, true) {
                        tracks.push(t);
                    }
                }
            }
        }
    }

    let pl_resp = client
        .get(format!("{}/users/{}/playlists/list", YM_API, uid))
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut playlists = Vec::new();
    if pl_resp.status().is_success() {
        let pl_json: Value = pl_resp.json().await.map_err(|e| e.to_string())?;
        if let Some(arr) = pl_json.get("result").and_then(|r| r.as_array()) {
            for item in arr {
                let kind = item.get("kind").and_then(|v| v.as_i64()).unwrap_or(0);
                let title = item
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Yandex Playlist")
                    .to_string();
                let cover = item
                    .get("ogImage")
                    .and_then(|v| v.as_str())
                    .map(|u| format!("https://{}", u.replace("%%", "400x400")));

                let mut pl_tracks = Vec::new();
                if let Ok(detail_resp) = client
                    .get(format!("{}/users/{}/playlists/{}", YM_API, uid, kind))
                    .header("Authorization", format!("OAuth {}", token))
                    .send()
                    .await
                {
                    if detail_resp.status().is_success() {
                        if let Ok(detail_json) = detail_resp.json::<Value>().await {
                            if let Some(items) = detail_json
                                .get("result")
                                .and_then(|r| r.get("tracks"))
                                .and_then(|t| t.as_array())
                            {
                                for entry in items {
                                    let t_obj = entry.get("track").unwrap_or(entry);
                                    if let Some(t) = parse_track(t_obj, false) {
                                        pl_tracks.push(t);
                                    }
                                }
                            }
                        }
                    }
                }

                let count = pl_tracks.len().max(
                    item.get("trackCount").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
                );
                let pl = Playlist {
                    id: format!("yandex_pl_{}_{}", uid, kind),
                    name: title,
                    source: SourceKind::Yandex,
                    track_count: count,
                    cover_url: cover,
                    description: Some("Yandex Music".to_string()),
                };
                playlists.push((pl, pl_tracks));
            }
        }
    }

    Ok((tracks, playlists))
}

pub async fn resolve_stream_url(
    client: &Client,
    token: &str,
    track_id: &str,
) -> Result<(String, u32, String), String> {
    let mut options: Vec<Value> = Vec::new();
    for attempt in 0..2 {
        let info_resp = client
            .get(format!("{}/tracks/{}/download-info", YM_API, track_id))
            .header("Authorization", format!("OAuth {}", token))
            .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
            .send()
            .await;

        match info_resp {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(info_json) = resp.json::<Value>().await {
                    if let Some(arr) = info_json.get("result").and_then(|r| r.as_array()) {
                        options = arr.clone();
                        break;
                    }
                }
            }
            _ => {
                if attempt == 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
            }
        }
    }

    if options.is_empty() {
        return Err("Track unavailable on Yandex Music".to_string());
    }

    options.sort_by(|a, b| {
        let a_mp3 = a.get("codec").and_then(|v| v.as_str()) == Some("mp3");
        let b_mp3 = b.get("codec").and_then(|v| v.as_str()) == Some("mp3");
        let a_br = a.get("bitrateInKbps").and_then(|v| v.as_u64()).unwrap_or(0);
        let b_br = b.get("bitrateInKbps").and_then(|v| v.as_u64()).unwrap_or(0);
        b_mp3.cmp(&a_mp3).then(b_br.cmp(&a_br))
    });

    for opt in options {
        let dl_url = match opt.get("downloadInfoUrl").and_then(|v| v.as_str()) {
            Some(u) => u,
            None => continue,
        };
        let bitrate = opt.get("bitrateInKbps").and_then(|v| v.as_u64()).unwrap_or(192) as u32;
        let codec = opt.get("codec").and_then(|v| v.as_str()).unwrap_or("mp3");
        let ext = if codec == "aac" { "m4a" } else { "mp3" }.to_string();

        let xml_resp = client.get(dl_url).send().await;
        let xml_text = match xml_resp {
            Ok(r) if r.status().is_success() => match r.text().await {
                Ok(t) => t,
                Err(_) => continue,
            },
            _ => continue,
        };

        let doc = match roxmltree::Document::parse(&xml_text) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let tag_text = |name: &str| -> Option<String> {
            doc.descendants()
                .find(|n| n.has_tag_name(name))
                .and_then(|n| n.text())
                .map(|s| s.to_string())
        };
        let (Some(host), Some(path), Some(ts), Some(s)) =
            (tag_text("host"), tag_text("path"), tag_text("ts"), tag_text("s"))
        else {
            continue;
        };

        let path_trimmed = path.trim_start_matches('/');
        let sign_input = format!("XGRlBW9FXlekgbPrRHuSiA{}{}", path_trimmed, s);
        let mut hasher = Md5::new();
        hasher.update(sign_input.as_bytes());
        let sign = format!("{:x}", hasher.finalize());

        let stream = format!("https://{}/get-mp3/{}/{}{}", host, sign, ts, path);
        return Ok((stream, bitrate, ext));
    }

    Err("Track unavailable on Yandex Music".to_string())
}

fn parse_track(v: &Value, liked: bool) -> Option<Track> {
    if v.get("available").and_then(|a| a.as_bool()) == Some(false) {
        return None;
    }
    let ext_id = v.get("id").and_then(|x| {
        x.as_str()
            .map(str::to_string)
            .or_else(|| x.as_i64().map(|n| n.to_string()))
    })?;
    let title = v.get("title").and_then(|x| x.as_str())?.trim().to_string();
    if title.is_empty() {
        return None;
    }
    let duration_ms = v.get("durationMs").and_then(|d| d.as_u64()).unwrap_or(0);
    if duration_ms == 0 {
        return None;
    }
    let artist = v
        .get("artists")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("name").and_then(|n| n.as_str()))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Unknown Artist".to_string());
    let album = v
        .get("albums")
        .and_then(|a| a.as_array())
        .and_then(|arr| arr.first())
        .and_then(|al| al.get("title"))
        .and_then(|t| t.as_str())
        .unwrap_or("Yandex Music")
        .to_string();
    let cover_url = v
        .get("coverUri")
        .or_else(|| v.get("ogImage"))
        .and_then(|c| c.as_str())
        .map(|u| format!("https://{}", u.replace("%%", "400x400")));
    let added_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    Some(Track {
        id: format!("yandex_{}", ext_id),
        source: SourceKind::Yandex,
        external_id: ext_id,
        title,
        artist,
        album,
        duration_ms,
        cover_url,
        stream_url: None,
        local_path: None,
        codec: Some("MP3".to_string()),
        bitrate_kbps: Some(320),
        sample_rate_hz: Some(44100),
        liked,
        added_at,
    })
}
