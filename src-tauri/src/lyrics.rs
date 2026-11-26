use std::path::Path;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricWord {
    pub time_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    pub time_ms: Option<u64>,
    pub text: String,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub words: Vec<LyricWord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsPayload {
    pub synced: bool,
    pub instrumental: bool,
    pub source: String,
    pub lines: Vec<LyricLine>,
}

fn clean_query_part(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0usize;
    let mut sq_depth = 0usize;
    for ch in s.chars() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            '[' => sq_depth += 1,
            ']' => sq_depth = sq_depth.saturating_sub(1),
            _ if depth == 0 && sq_depth == 0 => out.push(ch),
            _ => {}
        }
    }
    let lowered = out
        .replace("feat.", " ")
        .replace("ft.", " ")
        .replace("prod.", " ");
    lowered.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_timestamp_str(tag: &str) -> Option<u64> {
    let (mm_s, ss_s) = tag.split_once(':')?;
    let mm = mm_s.trim().parse::<u64>().ok()?;
    let ss = ss_s.trim().parse::<f64>().ok()?;
    Some(mm * 60_000 + (ss * 1000.0).round() as u64)
}

fn parse_enhanced_words(raw: &str) -> (String, Vec<LyricWord>) {
    if !raw.contains('<') || !raw.contains('>') {
        return (raw.trim().to_string(), Vec::new());
    }
    let mut words = Vec::new();
    let mut plain_parts = Vec::new();
    let mut rest = raw.trim();
    let mut current_ts: Option<u64> = None;

    while !rest.is_empty() {
        if let Some(open_idx) = rest.find('<') {
            let before = rest[..open_idx].trim();
            if !before.is_empty() {
                for token in before.split_whitespace() {
                    plain_parts.push(token.to_string());
                    if let Some(ts) = current_ts {
                        words.push(LyricWord {
                            time_ms: ts,
                            duration_ms: None,
                            text: token.to_string(),
                        });
                    }
                }
            }
            let after_open = &rest[open_idx + 1..];
            if let Some(close_idx) = after_open.find('>') {
                let tag = &after_open[..close_idx];
                if let Some(ts) = parse_timestamp_str(tag) {
                    current_ts = Some(ts);
                } else {
                    plain_parts.push(format!("<{}>", tag));
                }
                rest = &after_open[close_idx + 1..];
            } else {
                let rem = rest.trim();
                if !rem.is_empty() {
                    plain_parts.push(rem.to_string());
                }
                break;
            }
        } else {
            let rem = rest.trim();
            if !rem.is_empty() {
                for token in rem.split_whitespace() {
                    plain_parts.push(token.to_string());
                    if let Some(ts) = current_ts {
                        words.push(LyricWord {
                            time_ms: ts,
                            duration_ms: None,
                            text: token.to_string(),
                        });
                    }
                }
            }
            break;
        }
    }

    for i in 0..words.len() {
        if i + 1 < words.len() && words[i + 1].time_ms > words[i].time_ms {
            words[i].duration_ms = Some(words[i + 1].time_ms - words[i].time_ms);
        }
    }

    (plain_parts.join(" "), words)
}

fn parse_lrc(lrc: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for raw in lrc.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut rest = trimmed;
        let mut timestamps = Vec::new();
        while rest.starts_with('[') {
            let Some(close) = rest.find(']') else {
                break;
            };
            let tag = &rest[1..close];
            if let Some(ms) = parse_timestamp_str(tag) {
                timestamps.push(ms);
            }
            rest = &rest[close + 1..];
        }
        let (text, words) = parse_enhanced_words(rest);
        if timestamps.is_empty() {
            if !text.is_empty() && !trimmed.starts_with('[') {
                lines.push(LyricLine {
                    time_ms: None,
                    text,
                    words: Vec::new(),
                });
            }
        } else if !text.is_empty() {
            for ts in timestamps {
                lines.push(LyricLine {
                    time_ms: Some(ts),
                    text: text.clone(),
                    words: words.clone(),
                });
            }
        }
    }
    lines.sort_by_key(|l| l.time_ms.unwrap_or(u64::MAX));
    lines
}

fn parse_plain(plain: &str) -> Vec<LyricLine> {
    plain
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| LyricLine {
            time_ms: None,
            text: l.to_string(),
            words: Vec::new(),
        })
        .collect()
}

fn payload_from_lrclib(v: &Value) -> Option<LyricsPayload> {
    let instrumental = v.get("instrumental").and_then(|b| b.as_bool()).unwrap_or(false);
    if let Some(synced) = v.get("syncedLyrics").and_then(|s| s.as_str()) {
        let lines = parse_lrc(synced);
        if !lines.is_empty() {
            return Some(LyricsPayload {
                synced: true,
                instrumental,
                source: "LRCLIB".to_string(),
                lines,
            });
        }
    }
    if let Some(plain) = v.get("plainLyrics").and_then(|s| s.as_str()) {
        let lines = parse_plain(plain);
        if !lines.is_empty() {
            return Some(LyricsPayload {
                synced: false,
                instrumental,
                source: "LRCLIB".to_string(),
                lines,
            });
        }
    }
    if instrumental {
        return Some(LyricsPayload {
            synced: false,
            instrumental: true,
            source: "LRCLIB".to_string(),
            lines: Vec::new(),
        });
    }
    None
}

fn normalize_tokens(s: &str) -> Vec<String> {
    clean_query_part(s)
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

fn split_dash_title(title: &str) -> Option<(String, String)> {
    let (left, right) = title.split_once(" - ")?;
    let l = clean_query_part(left);
    let r = clean_query_part(right);
    if l.is_empty() || r.is_empty() {
        None
    } else {
        Some((l, r))
    }
}

fn tokens_match(query_tokens: &[String], cand_tokens: &[String]) -> f64 {
    if query_tokens.is_empty() || cand_tokens.is_empty() {
        return 0.0;
    }
    let q_joined = query_tokens.join(" ");
    let c_joined = cand_tokens.join(" ");
    if q_joined == c_joined {
        return 1.0;
    }
    if c_joined.contains(&q_joined) || q_joined.contains(&c_joined) {
        return 0.85;
    }
    let hits = query_tokens
        .iter()
        .filter(|qt| cand_tokens.iter().any(|ct| ct == *qt))
        .count();
    hits as f64 / query_tokens.len().max(cand_tokens.len()) as f64
}

async fn fetch_from_lrclib(
    client: &Client,
    artist: &str,
    title: &str,
    duration_ms: u64,
) -> Option<LyricsPayload> {
    let dur_sec = (duration_ms / 1000).to_string();
    let target_sec = (duration_ms / 1000) as f64;
    let clean_title = clean_query_part(title);
    let clean_artist = clean_query_part(artist);
    let dash_pair = split_dash_title(title);

    let mut get_candidates = Vec::new();
    if !clean_artist.is_empty() && !clean_title.is_empty() {
        get_candidates.push((clean_artist.clone(), clean_title.clone()));
    }
    if let Some((da, dt)) = &dash_pair {
        get_candidates.push((da.clone(), dt.clone()));
    }

    for (a, t) in &get_candidates {
        let mut req = client
            .get("https://lrclib.net/api/get")
            .query(&[("artist_name", a.as_str()), ("track_name", t.as_str())])
            .header("User-Agent", "Awase/0.1.0");
        if duration_ms > 0 {
            req = req.query(&[("duration", dur_sec.as_str())]);
        }
        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<Value>().await {
                    let item_dur = val.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0);
                    if target_sec > 0.0 && item_dur > 0.0 && (target_sec - item_dur).abs() > 20.0 {
                        continue;
                    }
                    if let Some(p) = payload_from_lrclib(&val) {
                        return Some(p);
                    }
                }
            }
        }
    }

    let mut search_pairs = Vec::new();
    if !clean_artist.is_empty() && !clean_title.is_empty() {
        search_pairs.push((clean_artist.clone(), clean_title.clone()));
    }
    if let Some((da, dt)) = &dash_pair {
        search_pairs.push((da.clone(), dt.clone()));
    }
    if search_pairs.is_empty() && !clean_title.is_empty() {
        search_pairs.push((String::new(), clean_title.clone()));
    }

    let mut best: Option<(f64, LyricsPayload)> = None;
    for (exp_artist, exp_title) in &search_pairs {
        let q = if exp_artist.is_empty() {
            exp_title.clone()
        } else {
            format!("{} {}", exp_artist, exp_title)
        };
        let q_artist_toks = normalize_tokens(exp_artist);
        let q_title_toks = normalize_tokens(exp_title);
        if q_title_toks.is_empty() {
            continue;
        }

        if let Ok(resp) = client
            .get("https://lrclib.net/api/search")
            .query(&[("q", q.as_str())])
            .header("User-Agent", "Awase/0.1.0")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(Value::Array(items)) = resp.json::<Value>().await {
                    for item in items.iter().take(10) {
                        let Some(p) = payload_from_lrclib(item) else {
                            continue;
                        };
                        let item_track = item
                            .get("trackName")
                            .and_then(|s| s.as_str())
                            .unwrap_or("");
                        let item_artist = item
                            .get("artistName")
                            .and_then(|s| s.as_str())
                            .unwrap_or("");
                        let item_dur = item.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0);

                        if target_sec > 0.0 && item_dur > 0.0 && (target_sec - item_dur).abs() > 15.0 {
                            continue;
                        }

                        let t_score = tokens_match(&q_title_toks, &normalize_tokens(item_track));
                        if t_score < 0.5 {
                            continue;
                        }

                        let a_score = if q_artist_toks.is_empty() {
                            0.5
                        } else {
                            tokens_match(&q_artist_toks, &normalize_tokens(item_artist))
                        };
                        if !q_artist_toks.is_empty() && a_score < 0.4 {
                            continue;
                        }

                        let dur_diff = if target_sec > 0.0 && item_dur > 0.0 {
                            (target_sec - item_dur).abs()
                        } else {
                            0.0
                        };
                        let sync_bonus = if p.synced { -8.0 } else { 0.0 };
                        let match_bonus = -(t_score * 10.0 + a_score * 10.0);
                        let score = dur_diff + sync_bonus + match_bonus;
                        if best.as_ref().map(|(b, _)| score < *b).unwrap_or(true) {
                            best = Some((score, p));
                        }
                    }
                }
            }
        }
        if best.is_some() {
            break;
        }
    }
    best.map(|(_, p)| p)
}

async fn fetch_from_yandex(client: &Client, token: &str, track_id: &str) -> Option<LyricsPayload> {
    let resp = client
        .get(format!("https://api.music.yandex.net/tracks/{}/supplement", track_id))
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: Value = resp.json().await.ok()?;
    let full = json
        .get("result")
        .and_then(|r| r.get("lyrics"))
        .and_then(|l| l.get("fullLyrics"))
        .and_then(|s| s.as_str())?;
    let lines = parse_plain(full);
    if lines.is_empty() {
        return None;
    }
    Some(LyricsPayload {
        synced: false,
        instrumental: false,
        source: "Yandex Music".to_string(),
        lines,
    })
}

pub async fn get_lyrics(
    client: &Client,
    cache_dir: &Path,
    track_id: &str,
    external_id: &str,
    source: &str,
    artist: &str,
    title: &str,
    duration_ms: u64,
    yandex_token: Option<&str>,
) -> Result<LyricsPayload, String> {
    let lyr_dir = cache_dir.join("lyrics");
    std::fs::create_dir_all(&lyr_dir).map_err(|e| e.to_string())?;
    let safe_id: String = track_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    let cache_path = lyr_dir.join(format!("{}.json", safe_id));
    if cache_path.exists() {
        if let Ok(raw) = std::fs::read_to_string(&cache_path) {
            if let Ok(cached) = serde_json::from_str::<LyricsPayload>(&raw) {
                return Ok(cached);
            }
        }
    }

    let mut found = fetch_from_lrclib(client, artist, title, duration_ms).await;
    if found.is_none() && source == "yandex" {
        if let Some(tok) = yandex_token {
            found = fetch_from_yandex(client, tok, external_id).await;
        }
    }

    if let Some(payload) = found {
        if let Ok(json) = serde_json::to_string(&payload) {
            let _ = std::fs::write(&cache_path, json);
        }
        return Ok(payload);
    }

    Err("Lyrics not found for this track".to_string())
}
