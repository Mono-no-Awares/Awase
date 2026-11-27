use std::time::{SystemTime, UNIX_EPOCH};
use base64::Engine;
use rand::RngCore;
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use crate::models::{Playlist, SourceKind, Track};

const SPOTIFY_API: &str = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
pub const SPOTIFY_REDIRECT_URI: &str = "http://127.0.0.1:43821/callback";

pub fn generate_pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 48];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hasher.finalize());
    (verifier, challenge)
}

pub async fn exchange_code(
    client: &Client,
    client_id: &str,
    code: &str,
    verifier: &str,
) -> Result<String, String> {
    let resp = client
        .post(SPOTIFY_TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", SPOTIFY_REDIRECT_URI),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Spotify token exchange HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    json.get("access_token")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Missing Spotify access_token".to_string())
}

pub async fn fetch_me(client: &Client, token: &str) -> Result<String, String> {
    let resp = client
        .get(format!("{}/me", SPOTIFY_API))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Spotify auth HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let name = json
        .get("display_name")
        .or_else(|| json.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("Spotify Listener")
        .to_string();
    Ok(name)
}

pub async fn search_tracks(client: &Client, token: &str, query: &str) -> Result<Vec<Track>, String> {
    let resp = client
        .get(format!("{}/search", SPOTIFY_API))
        .bearer_auth(token)
        .query(&[("q", query), ("type", "track"), ("limit", "20")])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Spotify search HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = json
        .get("tracks")
        .and_then(|t| t.get("items"))
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items.iter().filter_map(|v| parse_track(v, false)).collect())
}

pub async fn sync_library(
    client: &Client,
    token: &str,
    client_token: Option<&str>,
) -> Result<(Vec<Track>, Vec<Playlist>), String> {
    let mut tracks = Vec::new();
    let mut offset = 0usize;

    for _ in 0..20 {
        let mut req = client
            .get(format!("{}/me/tracks", SPOTIFY_API))
            .bearer_auth(token)
            .header("Origin", "https://open.spotify.com")
            .header("Referer", "https://open.spotify.com/")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            )
            .query(&[("limit", "50"), ("offset", &offset.to_string())]);
        if let Some(ct) = client_token.filter(|s| !s.is_empty()) {
            req = req.header("client-token", ct);
        }
        let mut saved_resp = req.send().await.map_err(|e| e.to_string())?;
        if saved_resp.status().as_u16() == 429 {
            let wait_s = saved_resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(2)
                .min(5);
            tokio::time::sleep(std::time::Duration::from_secs(wait_s)).await;
            let mut retry = client
                .get(format!("{}/me/tracks", SPOTIFY_API))
                .bearer_auth(token)
                .header("Origin", "https://open.spotify.com")
                .header("Referer", "https://open.spotify.com/")
                .query(&[("limit", "50"), ("offset", &offset.to_string())]);
            if let Some(ct) = client_token.filter(|s| !s.is_empty()) {
                retry = retry.header("client-token", ct);
            }
            saved_resp = retry.send().await.map_err(|e| e.to_string())?;
        }

        if !saved_resp.status().is_success() {
            if offset == 0 {
                return Err(format!("Spotify sync HTTP {} (reconnect Spotify)", saved_resp.status()));
            }
            break;
        }

        let json: Value = saved_resp.json().await.map_err(|e| e.to_string())?;
        let items = json
            .get("items")
            .and_then(|i| i.as_array())
            .cloned()
            .unwrap_or_default();
        if items.is_empty() {
            break;
        }
        let batch_len = items.len();
        for item in items {
            if let Some(track_obj) = item.get("track") {
                if let Some(t) = parse_track(track_obj, true) {
                    tracks.push(t);
                }
            }
        }
        if batch_len < 50 {
            break;
        }
        offset += 50;
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    }

    let mut playlists = Vec::new();
    let mut pl_offset = 0usize;
    loop {
        let mut pl_req = client
            .get(format!("{}/me/playlists", SPOTIFY_API))
            .bearer_auth(token)
            .header("Origin", "https://open.spotify.com")
            .header("Referer", "https://open.spotify.com/")
            .query(&[("limit", "50"), ("offset", &pl_offset.to_string())]);
        if let Some(ct) = client_token.filter(|s| !s.is_empty()) {
            pl_req = pl_req.header("client-token", ct);
        }
        let pl_resp = pl_req.send().await.map_err(|e| e.to_string())?;
        if !pl_resp.status().is_success() {
            break;
        }
        let json: Value = pl_resp.json().await.map_err(|e| e.to_string())?;
        let Some(items) = json.get("items").and_then(|i| i.as_array()) else {
            break;
        };
        if items.is_empty() {
            break;
        }
        for pl in items {
            let id = match pl.get("id").and_then(|v| v.as_str()) {
                Some(s) => s,
                None => continue,
            };
            let name = pl
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Spotify Playlist")
                .to_string();
            let count = pl
                .get("tracks")
                .and_then(|t| t.get("total"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;
            let cover = pl
                .get("images")
                .and_then(|i| i.as_array())
                .and_then(|arr| arr.first())
                .and_then(|img| img.get("url"))
                .and_then(|u| u.as_str())
                .map(str::to_string);
            playlists.push(Playlist {
                id: format!("spotify_pl_{}", id),
                name,
                source: SourceKind::Spotify,
                track_count: count,
                cover_url: cover,
                description: Some("Synced from Spotify".to_string()),
            });
        }
        if json.get("next").and_then(|n| n.as_str()).is_none() || pl_offset >= 500 {
            break;
        }
        pl_offset += 50;
    }

    Ok((tracks, playlists))
}

fn parse_track(v: &Value, liked: bool) -> Option<Track> {
    let ext_id = v.get("id").and_then(|x| x.as_str())?.to_string();
    let title = v.get("name").and_then(|x| x.as_str())?.to_string();
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
        .unwrap_or_else(|| "Spotify Artist".to_string());
    let album = v
        .get("album")
        .and_then(|a| a.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("Spotify")
        .to_string();
    let cover_url = v
        .get("album")
        .and_then(|a| a.get("images"))
        .and_then(|i| i.as_array())
        .and_then(|arr| arr.first())
        .and_then(|img| img.get("url"))
        .and_then(|u| u.as_str())
        .map(str::to_string);
    let duration_ms = v.get("duration_ms").and_then(|d| d.as_u64()).unwrap_or(0);
    let preview_url = v
        .get("preview_url")
        .and_then(|u| u.as_str())
        .map(str::to_string);
    let added_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    Some(Track {
        id: format!("spotify_{}", ext_id),
        source: SourceKind::Spotify,
        external_id: ext_id,
        title,
        artist,
        album,
        duration_ms,
        cover_url,
        stream_url: preview_url,
        local_path: None,
        codec: Some("STREAM".to_string()),
        bitrate_kbps: Some(320),
        sample_rate_hz: Some(44100),
        liked,
        added_at,
    })
}

pub fn extract_spotify_playlist_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if let Some(rest) = trimmed.strip_prefix("spotify:playlist:") {
        let id = rest.trim();
        return if id.is_empty() { None } else { Some(id.to_string()) };
    }
    if let Some(idx) = trimmed.find("/playlist/") {
        let after = &trimmed[idx + "/playlist/".len()..];
        let id = after.split(&['?', '/', '#'][..]).next().unwrap_or("").trim();
        return if id.is_empty() { None } else { Some(id.to_string()) };
    }
    if trimmed.len() >= 16 && trimmed.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Some(trimmed.to_string());
    }
    None
}

async fn fetch_web_anon_token(client: &Client) -> Option<String> {
    let resp = client
        .get("https://open.spotify.com/get_access_token?reason=transport&productType=web_player")
        .header("Referer", "https://open.spotify.com/")
        .header("Origin", "https://open.spotify.com")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: Value = resp.json().await.ok()?;
    json.get("accessToken")
        .and_then(|t| t.as_str())
        .map(str::to_string)
}

pub async fn import_public_playlist_via_api(
    client: &Client,
    pid: &str,
    token: &str,
    client_token: Option<&str>,
) -> Option<(Playlist, Vec<Track>)> {
    let mut meta_req = client
        .get(format!("{}/playlists/{}", SPOTIFY_API, pid))
        .bearer_auth(token)
        .query(&[("fields", "name,images,tracks(total)")]);
    if let Some(ct) = client_token.filter(|s| !s.is_empty()) {
        meta_req = meta_req.header("client-token", ct);
    }
    let meta_resp = meta_req.send().await.ok()?;
    if !meta_resp.status().is_success() {
        return None;
    }
    let meta: Value = meta_resp.json().await.ok()?;
    let pl_name = meta
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Spotify Playlist")
        .to_string();
    let pl_cover = meta
        .get("images")
        .and_then(|i| i.as_array())
        .and_then(|arr| arr.first())
        .and_then(|img| img.get("url"))
        .and_then(|u| u.as_str())
        .map(str::to_string);

    let mut tracks = Vec::new();
    let mut offset = 0usize;
    loop {
        let mut req = client
            .get(format!("{}/playlists/{}/tracks", SPOTIFY_API, pid))
            .bearer_auth(token)
            .header("Origin", "https://open.spotify.com")
            .header("Referer", "https://open.spotify.com/")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            )
            .query(&[("limit", "100"), ("offset", &offset.to_string())]);
        if let Some(ct) = client_token.filter(|s| !s.is_empty()) {
            req = req.header("client-token", ct);
        }
        let mut resp = req.send().await.ok()?;
        if resp.status().as_u16() == 429 {
            let wait_s = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(2)
                .min(5);
            tokio::time::sleep(std::time::Duration::from_secs(wait_s)).await;
            let mut retry = client
                .get(format!("{}/playlists/{}/tracks", SPOTIFY_API, pid))
                .bearer_auth(token)
                .header("Origin", "https://open.spotify.com")
                .header("Referer", "https://open.spotify.com/")
                .query(&[("limit", "100"), ("offset", &offset.to_string())]);
            if let Some(ct) = client_token.filter(|s| !s.is_empty()) {
                retry = retry.header("client-token", ct);
            }
            resp = retry.send().await.ok()?;
        }
        if !resp.status().is_success() {
            break;
        }
        let json: Value = resp.json().await.ok()?;
        let Some(items) = json.get("items").and_then(|i| i.as_array()) else {
            break;
        };
        if items.is_empty() {
            break;
        }
        for item in items {
            if let Some(t_val) = item.get("track") {
                if let Some(t) = parse_track(t_val, false) {
                    tracks.push(t);
                }
            }
        }
        if json.get("next").and_then(|n| n.as_str()).is_none() || offset >= 3000 {
            break;
        }
        offset += 100;
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    if tracks.is_empty() {
        return None;
    }
    let playlist = Playlist {
        id: format!("spotify_pl_{}", pid),
        name: pl_name,
        source: SourceKind::Spotify,
        track_count: tracks.len(),
        cover_url: pl_cover,
        description: Some("Imported from Spotify link".to_string()),
    };
    Some((playlist, tracks))
}

pub async fn import_public_playlist(
    client: &Client,
    url_or_id: &str,
    user_token: Option<&str>,
) -> Result<(Playlist, Vec<Track>), String> {
    let pid = extract_spotify_playlist_id(url_or_id)
        .ok_or_else(|| "Invalid Spotify playlist link (expected open.spotify.com/playlist/...)".to_string())?;

    if let Some(tok) = user_token.filter(|t| !t.trim().is_empty()) {
        if let Some(full) = import_public_playlist_via_api(client, &pid, tok, None).await {
            return Ok(full);
        }
    }

    if let Some(anon_tok) = fetch_web_anon_token(client).await {
        if let Some(full) = import_public_playlist_via_api(client, &pid, &anon_tok, None).await {
            return Ok(full);
        }
    }

    let embed_url = format!("https://open.spotify.com/embed/playlist/{}", pid);
    let html = client
        .get(&embed_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let after_id = html
        .split("__NEXT_DATA__")
        .nth(1)
        .ok_or_else(|| "Could not read Spotify playlist page (make sure it is public)".to_string())?;
    let json_start = after_id
        .split_once('>')
        .map(|(_, r)| r)
        .ok_or_else(|| "Malformed Spotify embed page".to_string())?;
    let json_str = json_start
        .split("</script>")
        .next()
        .ok_or_else(|| "Malformed Spotify embed script".to_string())?;

    let root: Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    let entity = &root["props"]["pageProps"]["state"]["data"]["entity"];
    let pl_name = entity
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| entity.get("title").and_then(|v| v.as_str()))
        .unwrap_or("Spotify Playlist")
        .to_string();

    let pl_cover = entity
        .get("coverArt")
        .and_then(|c| c.get("sources"))
        .and_then(|s| s.as_array())
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("url"))
        .and_then(|u| u.as_str())
        .map(str::to_string);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let mut tracks = Vec::new();
    if let Some(arr) = entity.get("trackList").and_then(|v| v.as_array()) {
        for (idx, item) in arr.iter().enumerate() {
            let uri = item.get("uri").and_then(|u| u.as_str()).unwrap_or("");
            let ext_id = uri
                .rsplit(':')
                .next()
                .filter(|s| !s.is_empty())
                .unwrap_or("unknown")
                .to_string();
            let title = match item.get("title").and_then(|v| v.as_str()) {
                Some(t) if !t.trim().is_empty() => t.to_string(),
                _ => continue,
            };
            let artist = item
                .get("subtitle")
                .and_then(|v| v.as_str())
                .unwrap_or("Spotify Artist")
                .replace('\u{00A0}', " ");
            let duration_ms = item.get("duration").and_then(|d| d.as_u64()).unwrap_or(0);
            let preview = item
                .get("audioPreview")
                .and_then(|p| p.get("url"))
                .and_then(|u| u.as_str())
                .map(str::to_string);

            tracks.push(Track {
                id: format!("spotify_{}", ext_id),
                source: SourceKind::Spotify,
                external_id: ext_id,
                title,
                artist,
                album: pl_name.clone(),
                duration_ms,
                cover_url: pl_cover.clone(),
                stream_url: preview,
                local_path: None,
                codec: Some("MP3".to_string()),
                bitrate_kbps: Some(128),
                sample_rate_hz: Some(44100),
                liked: false,
                added_at: now - idx as i64,
            });
        }
    }

    if tracks.is_empty() {
        return Err("Spotify playlist is empty or private".to_string());
    }

    let playlist = Playlist {
        id: format!("spotify_pl_{}", pid),
        name: pl_name,
        source: SourceKind::Spotify,
        track_count: tracks.len(),
        cover_url: pl_cover,
        description: Some("Imported from Spotify".to_string()),
    };

    Ok((playlist, tracks))
}

fn parse_csv_row(line: &str) -> Vec<String> {
    let mut cols = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '"' {
            if in_quotes && chars.peek() == Some(&'"') {
                cur.push('"');
                chars.next();
            } else {
                in_quotes = !in_quotes;
            }
        } else if ch == ',' && !in_quotes {
            cols.push(cur.trim().to_string());
            cur.clear();
        } else {
            cur.push(ch);
        }
    }
    cols.push(cur.trim().to_string());
    cols
}

pub fn import_from_file(
    file_path: &str,
) -> Result<(Vec<Track>, Vec<(Playlist, Vec<Track>)>), String> {
    let raw = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    if file_path.to_lowercase().ends_with(".csv") {
        let mut lines = raw.lines();
        let header_line = lines.next().ok_or_else(|| "Empty CSV file".to_string())?;
        let headers: Vec<String> = parse_csv_row(header_line)
            .into_iter()
            .map(|h| h.to_lowercase())
            .collect();

        let idx_uri = headers.iter().position(|h| h.contains("track uri") || h == "uri");
        let idx_title = headers
            .iter()
            .position(|h| h.contains("track name") || h == "title" || h == "name")
            .ok_or_else(|| "CSV missing Track Name column".to_string())?;
        let idx_artist = headers.iter().position(|h| h.contains("artist"));
        let idx_album = headers.iter().position(|h| h.contains("album"));
        let idx_dur = headers.iter().position(|h| h.contains("duration"));

        let mut tracks = Vec::new();
        for (i, line) in lines.enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            let cols = parse_csv_row(line);
            let title = match cols.get(idx_title) {
                Some(t) if !t.is_empty() => t.clone(),
                _ => continue,
            };
            let artist = idx_artist
                .and_then(|idx| cols.get(idx))
                .cloned()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Spotify Artist".to_string());
            let album = idx_album
                .and_then(|idx| cols.get(idx))
                .cloned()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Spotify".to_string());
            let duration_ms = idx_dur
                .and_then(|idx| cols.get(idx))
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let ext_id = idx_uri
                .and_then(|idx| cols.get(idx))
                .and_then(|u| u.rsplit(':').next())
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("csv_{}_{}", now, i));

            tracks.push(Track {
                id: format!("spotify_{}", ext_id),
                source: SourceKind::Spotify,
                external_id: ext_id,
                title,
                artist,
                album,
                duration_ms,
                cover_url: None,
                stream_url: None,
                local_path: None,
                codec: Some("MP3".to_string()),
                bitrate_kbps: Some(128),
                sample_rate_hz: Some(44100),
                liked: true,
                added_at: now,
            });
        }
        return Ok((tracks, Vec::new()));
    }

    let val: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let mut liked_tracks = Vec::new();
    let mut playlists = Vec::new();

    if let Some(arr) = val.get("tracks").and_then(|v| v.as_array()) {
        for (i, item) in arr.iter().enumerate() {
            let title = match item.get("track").and_then(|v| v.as_str()) {
                Some(t) if !t.is_empty() => t.to_string(),
                _ => continue,
            };
            let artist = item
                .get("artist")
                .and_then(|v| v.as_str())
                .unwrap_or("Spotify Artist")
                .to_string();
            let album = item
                .get("album")
                .and_then(|v| v.as_str())
                .unwrap_or("Spotify")
                .to_string();
            let ext_id = item
                .get("uri")
                .and_then(|v| v.as_str())
                .and_then(|u| u.rsplit(':').next())
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("json_{}_{}", now, i));

            liked_tracks.push(Track {
                id: format!("spotify_{}", ext_id),
                source: SourceKind::Spotify,
                external_id: ext_id,
                title,
                artist,
                album,
                duration_ms: 0,
                cover_url: None,
                stream_url: None,
                local_path: None,
                codec: Some("MP3".to_string()),
                bitrate_kbps: Some(128),
                sample_rate_hz: Some(44100),
                liked: true,
                added_at: now,
            });
        }
    }

    if let Some(pls) = val.get("playlists").and_then(|v| v.as_array()) {
        for (p_idx, pl) in pls.iter().enumerate() {
            let name = pl
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Spotify Playlist")
                .to_string();
            let mut pl_tracks = Vec::new();
            if let Some(items) = pl.get("items").and_then(|v| v.as_array()) {
                for (t_idx, entry) in items.iter().enumerate() {
                    let tr = entry.get("track").unwrap_or(entry);
                    let title = match tr
                        .get("trackName")
                        .or_else(|| tr.get("track"))
                        .and_then(|v| v.as_str())
                    {
                        Some(t) if !t.is_empty() => t.to_string(),
                        _ => continue,
                    };
                    let artist = tr
                        .get("artistName")
                        .or_else(|| tr.get("artist"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Spotify Artist")
                        .to_string();
                    let album = tr
                        .get("albumName")
                        .or_else(|| tr.get("album"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(&name)
                        .to_string();
                    let ext_id = tr
                        .get("trackUri")
                        .or_else(|| tr.get("uri"))
                        .and_then(|v| v.as_str())
                        .and_then(|u| u.rsplit(':').next())
                        .filter(|s| !s.is_empty())
                        .map(str::to_string)
                        .unwrap_or_else(|| format!("pl_{}_{}_{}", now, p_idx, t_idx));

                    pl_tracks.push(Track {
                        id: format!("spotify_{}", ext_id),
                        source: SourceKind::Spotify,
                        external_id: ext_id,
                        title,
                        artist,
                        album,
                        duration_ms: 0,
                        cover_url: None,
                        stream_url: None,
                        local_path: None,
                        codec: Some("MP3".to_string()),
                        bitrate_kbps: Some(128),
                        sample_rate_hz: Some(44100),
                        liked: false,
                        added_at: now,
                    });
                }
            }
            if !pl_tracks.is_empty() {
                playlists.push((
                    Playlist {
                        id: format!("spotify_pl_imp_{}_{}", now, p_idx),
                        name,
                        source: SourceKind::Spotify,
                        track_count: pl_tracks.len(),
                        cover_url: None,
                        description: Some("Imported from Spotify".to_string()),
                    },
                    pl_tracks,
                ));
            }
        }
    }

    Ok((liked_tracks, playlists))
}
