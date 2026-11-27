use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};
use md5::{Digest, Md5};
use parking_lot::Mutex;
use reqwest::Client;
use serde_json::{json, Value};
use crate::models::{Playlist, SourceKind, Track};

const YM_API: &str = "https://api.music.yandex.net";

struct WaveSession {
    batch_id: Option<String>,
    last_track_id: Option<String>,
    seen_ids: HashSet<String>,
}

static WAVE_SESSION: Mutex<Option<WaveSession>> = Mutex::new(None);

pub fn load_wave_seen(ids: Vec<String>, last_id: Option<String>) {
    let mut guard = WAVE_SESSION.lock();
    let sess = guard.get_or_insert_with(|| WaveSession {
        batch_id: None,
        last_track_id: None,
        seen_ids: HashSet::new(),
    });
    if sess.last_track_id.is_none() && last_id.is_some() {
        sess.last_track_id = last_id;
    }
    for id in ids {
        sess.seen_ids.insert(id);
    }
}

pub fn dump_wave_seen() -> (Vec<String>, Option<String>) {
    let guard = WAVE_SESSION.lock();
    guard
        .as_ref()
        .map(|s| {
            (
                s.seen_ids.iter().take(800).cloned().collect(),
                s.last_track_id.clone(),
            )
        })
        .unwrap_or_else(|| (Vec::new(), None))
}

pub async fn set_track_like(
    client: &Client,
    token: &str,
    track_id: &str,
    liked: bool,
) -> Result<(), String> {
    let (uid, _) = fetch_account_status(client, token).await?;
    let action = if liked { "add" } else { "remove" };
    let url = format!("{}/users/{}/likes/tracks/{}", YM_API, uid, action);
    let resp = client
        .post(url)
        .header("Authorization", format!("OAuth {}", token))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
        .form(&[("track-ids", track_id)])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Yandex like HTTP {}", resp.status()));
    }
    Ok(())
}

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
    let base_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let liked_entries: Vec<(String, i64)> = likes_json
        .get("result")
        .and_then(|r| r.get("library"))
        .and_then(|l| l.get("tracks"))
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(idx, item)| {
                    let id = item.get("id").and_then(|v| {
                        v.as_str()
                            .map(str::to_string)
                            .or_else(|| v.as_i64().map(|n| n.to_string()))
                    })?;
                    let ts = item
                        .get("timestamp")
                        .and_then(|v| v.as_str())
                        .and_then(super::parse_iso_timestamp)
                        .unwrap_or_else(|| base_ts - idx as i64);
                    Some((id, ts))
                })
                .collect()
        })
        .unwrap_or_default();

    let ts_map: std::collections::HashMap<String, i64> = liked_entries.iter().cloned().collect();
    let track_ids: Vec<String> = liked_entries.iter().map(|(id, _)| id.clone()).collect();

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
                    if let Some(mut t) = parse_track(v, true) {
                        if let Some(&ts) = ts_map.get(&t.external_id) {
                            t.added_at = ts;
                        }
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

pub async fn send_wave_feedback(
    client: &Client,
    token: &str,
    feedback_type: &str,
    track_id: Option<&str>,
    total_played_seconds: Option<f64>,
) {
    let batch_id = {
        let guard = WAVE_SESSION.lock();
        guard.as_ref().and_then(|s| s.batch_id.clone())
    };
    let Some(bid) = batch_id else {
        return;
    };
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);
    let mut body = json!({
        "type": feedback_type,
        "timestamp": ts,
    });
    if feedback_type == "radioStarted" {
        body["from"] = json!("desktop-home-radio");
    }
    if let Some(tid) = track_id {
        body["trackId"] = json!(tid);
    }
    if let Some(sec) = total_played_seconds {
        body["totalPlayedSeconds"] = json!(sec);
    }
    let _ = client
        .post(format!("{}/rotor/station/user:onyourwave/feedback", YM_API))
        .header("Authorization", format!("OAuth {}", token))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
        .query(&[("batch-id", bid.as_str())])
        .json(&body)
        .send()
        .await;
}

async fn fetch_rotor_station(
    client: &Client,
    token: &str,
    station: &str,
    queue_id: Option<&str>,
) -> Result<(Option<String>, Vec<Track>), String> {
    let mut req = client
        .get(format!("{}/rotor/station/{}/tracks", YM_API, station))
        .header("Authorization", format!("OAuth {}", token))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
        .query(&[("settings2", "true")]);
    if let Some(q) = queue_id {
        req = req.query(&[("queue", q)]);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Yandex My Wave HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let batch_id = json
        .get("result")
        .and_then(|r| r.get("batchId"))
        .and_then(|b| b.as_str())
        .map(str::to_string);

    let mut parsed = Vec::new();
    if let Some(seq) = json
        .get("result")
        .and_then(|r| r.get("sequence"))
        .and_then(|s| s.as_array())
    {
        for item in seq {
            let t_val = item.get("track").unwrap_or(item);
            if let Some(t) = parse_track(t_val, false) {
                parsed.push(t);
            }
        }
    }
    Ok((batch_id, parsed))
}

fn norm_track_key(t: &Track) -> String {
    format!(
        "{}|{}",
        t.title.trim().to_lowercase(),
        t.artist.trim().to_lowercase()
    )
}

pub async fn fetch_my_wave(
    client: &Client,
    token: &str,
    reset: bool,
    seed_ids: &[String],
) -> Result<Vec<Track>, String> {
    let queue_param = {
        let mut guard = WAVE_SESSION.lock();
        let sess = guard.get_or_insert_with(|| WaveSession {
            batch_id: None,
            last_track_id: None,
            seen_ids: HashSet::new(),
        });
        sess.last_track_id.clone()
    };

    if let Some(last_tid) = queue_param.as_deref() {
        send_wave_feedback(client, token, "trackFinished", Some(last_tid), Some(35.0)).await;
    }

    let (new_batch_id, mut parsed) =
        fetch_rotor_station(client, token, "user:onyourwave", queue_param.as_deref()).await?;

    let filter_unseen = |list: &[Track]| -> Vec<Track> {
        let guard = WAVE_SESSION.lock();
        let seen = guard.as_ref().map(|s| &s.seen_ids);
        let mut batch_keys = HashSet::new();
        list.iter()
            .filter(|t| {
                let key = norm_track_key(t);
                let unseen = seen
                    .map(|s| !s.contains(&t.external_id) && !s.contains(&key))
                    .unwrap_or(true);
                unseen && batch_keys.insert(key)
            })
            .cloned()
            .collect()
    };

    let mut fresh = filter_unseen(&parsed);

    if fresh.is_empty() {
        if let Some(first) = parsed.first() {
            send_wave_feedback(client, token, "skip", Some(&first.external_id), Some(1.0)).await;
        }
        let fallback_seeds: Vec<String> = if !seed_ids.is_empty() {
            seed_ids.to_vec()
        } else {
            parsed.iter().map(|t| t.external_id.clone()).collect()
        };
        if !fallback_seeds.is_empty() {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.subsec_nanos() as usize)
                .unwrap_or(0);
            for attempt in 0..3.min(fallback_seeds.len()) {
                let pick_idx = (nanos + attempt * 7) % fallback_seeds.len();
                let seed_station = format!("track:{}", fallback_seeds[pick_idx]);
                if let Ok((_, alt_parsed)) =
                    fetch_rotor_station(client, token, &seed_station, None).await
                {
                    let alt_fresh = filter_unseen(&alt_parsed);
                    if !alt_fresh.is_empty() {
                        parsed = alt_parsed;
                        fresh = alt_fresh;
                        break;
                    }
                }
            }
        }
    }

    let out = {
        let mut guard = WAVE_SESSION.lock();
        let sess = guard.get_or_insert_with(|| WaveSession {
            batch_id: None,
            last_track_id: None,
            seen_ids: HashSet::new(),
        });
        if new_batch_id.is_some() {
            sess.batch_id = new_batch_id;
        }
        if sess.seen_ids.len() > 800 {
            sess.seen_ids.clear();
        }
        let chosen = if fresh.is_empty() { parsed } else { fresh };
        if let Some(last) = chosen.last() {
            sess.last_track_id = Some(last.external_id.clone());
        }
        for t in &chosen {
            sess.seen_ids.insert(t.external_id.clone());
            sess.seen_ids.insert(norm_track_key(t));
        }
        chosen
    };

    if reset {
        send_wave_feedback(client, token, "radioStarted", None, None).await;
    }

    Ok(out)
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
