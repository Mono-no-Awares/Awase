use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use reqwest::Client;
use serde_json::Value;
use crate::models::{SourceKind, Track};

const SC_API: &str = "https://api-v2.soundcloud.com";

pub async fn resolve_client_id(client: &Client, cached: Option<&str>) -> Result<String, String> {
    if let Some(cid) = cached {
        if !cid.trim().is_empty() {
            return Ok(cid.to_string());
        }
    }
    let html = client
        .get("https://soundcloud.com")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mut script_urls = Vec::new();
    for segment in html.split("src=\"") {
        if let Some(end) = segment.find('"') {
            let url = &segment[..end];
            if url.starts_with("https://a-v2.sndcdn.com/assets/") && url.ends_with(".js") {
                script_urls.push(url.to_string());
            }
        }
    }

    for url in script_urls.into_iter().rev().take(6) {
        if let Ok(resp) = client.get(&url).send().await {
            if let Ok(js) = resp.text().await {
                if let Some(cid) = extract_client_id_from_js(&js) {
                    return Ok(cid);
                }
            }
        }
    }
    Err("Could not obtain SoundCloud public client_id".to_string())
}

fn extract_client_id_from_js(js: &str) -> Option<String> {
    for needle in ["client_id:\"", "client_id=\"", "client_id: \""] {
        if let Some(idx) = js.find(needle) {
            let rest = &js[idx + needle.len()..];
            if let Some(end) = rest.find('"') {
                let candidate = &rest[..end];
                if candidate.len() >= 20 && candidate.len() <= 48 && candidate.chars().all(|c| c.is_ascii_alphanumeric()) {
                    return Some(candidate.to_string());
                }
            }
        }
    }
    None
}

pub async fn search_tracks(
    client: &Client,
    client_id: &str,
    query: &str,
) -> Result<Vec<Track>, String> {
    let resp = client
        .get(format!("{}/search/tracks", SC_API))
        .query(&[("q", query), ("client_id", client_id), ("limit", "20")])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("SoundCloud search HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = json
        .get("collection")
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items.iter().filter_map(|v| parse_track(v, false)).collect())
}

pub async fn sync_likes(
    client: &Client,
    client_id: &str,
    profile_handle: Option<&str>,
    token: Option<&str>,
) -> Result<Vec<Track>, String> {
    let url = if let Some(tok) = token {
        let me_resp = client
            .get(format!("{}/me", SC_API))
            .bearer_auth(tok)
            .query(&[("client_id", client_id)])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let me: Value = me_resp.json().await.map_err(|e| e.to_string())?;
        let uid = me
            .get("id")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| "Missing SoundCloud user id".to_string())?;
        format!("{}/users/{}/likes", SC_API, uid)
    } else if let Some(handle) = profile_handle {
        let clean = handle
            .trim()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_start_matches("www.")
            .trim_start_matches("soundcloud.com/")
            .split(&['?', '#'][..])
            .next()
            .unwrap_or("")
            .trim_matches('/');
        let target_url = format!("https://soundcloud.com/{}", clean);
        let res = client
            .get(format!("{}/resolve", SC_API))
            .query(&[("url", target_url.as_str()), ("client_id", client_id)])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let user: Value = res.json().await.map_err(|e| e.to_string())?;
        let uid = user
            .get("id")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| "Could not resolve SoundCloud user".to_string())?;
        format!("{}/users/{}/likes", SC_API, uid)
    } else {
        return Err("Provide SoundCloud profile handle or OAuth token first".to_string());
    };

    let resp = client
        .get(url)
        .query(&[("client_id", client_id), ("limit", "40")])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = json.get("collection").and_then(|c| c.as_array()) {
        for item in arr {
            let track_val = item.get("track").unwrap_or(item);
            if let Some(t) = parse_track(track_val, true) {
                out.push(t);
            }
        }
    }
    Ok(out)
}

fn demux_mpeg_ts(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut audio_pid: Option<u16> = None;
    let mut i = 0;
    while i + 188 <= data.len() {
        if data[i] != 0x47 {
            i += 1;
            continue;
        }
        let pkt = &data[i..i + 188];
        i += 188;
        let pusi = (pkt[1] & 0x40) != 0;
        let pid = (((pkt[1] & 0x1F) as u16) << 8) | (pkt[2] as u16);
        let afc = (pkt[3] >> 4) & 0x03;
        if pid == 0 || pid == 0x1FFF || (afc & 0x01) == 0 {
            continue;
        }
        let mut pos = 4;
        if (afc & 0x02) != 0 {
            if pos >= 188 {
                continue;
            }
            let afl = pkt[pos] as usize;
            pos += 1 + afl;
        }
        if pos >= 188 {
            continue;
        }
        let payload = &pkt[pos..];
        if pusi {
            if payload.len() >= 9 && payload[0] == 0x00 && payload[1] == 0x00 && payload[2] == 0x01 {
                let stream_id = payload[3];
                if (0xC0..=0xDF).contains(&stream_id) {
                    audio_pid = Some(pid);
                    let pes_hdr_len = payload[8] as usize;
                    let start = 9 + pes_hdr_len;
                    if start < payload.len() {
                        out.extend_from_slice(&payload[start..]);
                    }
                }
            }
        } else if Some(pid) == audio_pid {
            out.extend_from_slice(payload);
        }
    }
    out
}

fn read_u32_be(b: &[u8], off: usize) -> u32 {
    u32::from_be_bytes([b[off], b[off + 1], b[off + 2], b[off + 3]])
}

fn read_u16_be(b: &[u8], off: usize) -> u16 {
    u16::from_be_bytes([b[off], b[off + 1]])
}

fn find_subbox<'a>(data: &'a [u8], tag: &[u8; 4]) -> Option<&'a [u8]> {
    let mut off = 0usize;
    while off + 8 <= data.len() {
        let sz = read_u32_be(data, off) as usize;
        if sz < 8 || off + sz > data.len() {
            break;
        }
        if &data[off + 4..off + 8] == tag {
            return Some(&data[off + 8..off + sz]);
        }
        off += sz;
    }
    None
}

fn sr_to_adts_index(sr: u32) -> u8 {
    match sr {
        96000 => 0,
        88200 => 1,
        64000 => 2,
        48000 => 3,
        44100 => 4,
        32000 => 5,
        24000 => 6,
        22050 => 7,
        16000 => 8,
        12000 => 9,
        11025 => 10,
        8000 => 11,
        7350 => 12,
        _ => 4,
    }
}

fn fmp4_to_adts_aac(data: &[u8]) -> Option<Vec<u8>> {
    let mut off = 0usize;
    let mut sample_rate = 44100u32;
    let mut channels = 2u8;
    let mut out = Vec::with_capacity(data.len());
    let mut last_moof_sizes: Vec<usize> = Vec::new();
    let mut has_moov = false;

    while off + 8 <= data.len() {
        let mut sz = read_u32_be(data, off) as usize;
        let tag = &data[off + 4..off + 8];
        let mut hdr_len = 8usize;
        if sz == 1 && off + 16 <= data.len() {
            let ext = u64::from_be_bytes([
                data[off + 8], data[off + 9], data[off + 10], data[off + 11],
                data[off + 12], data[off + 13], data[off + 14], data[off + 15],
            ]) as usize;
            sz = ext;
            hdr_len = 16;
        }
        if sz < hdr_len || off + sz > data.len() {
            break;
        }
        let body = &data[off + hdr_len..off + sz];

        if tag == b"moov" {
            has_moov = true;
            if let Some(trak) = find_subbox(body, b"trak") {
                if let Some(mdia) = find_subbox(trak, b"mdia") {
                    if let Some(mdhd) = find_subbox(mdia, b"mdhd") {
                        if mdhd.len() >= 16 {
                            let ver = mdhd[0];
                            let ts = if ver == 1 && mdhd.len() >= 24 {
                                read_u32_be(mdhd, 20)
                            } else {
                                read_u32_be(mdhd, 12)
                            };
                            if (8000..=96000).contains(&ts) {
                                sample_rate = ts;
                            }
                        }
                    }
                    if let Some(minf) = find_subbox(mdia, b"minf") {
                        if let Some(stbl) = find_subbox(minf, b"stbl") {
                            if let Some(stsd) = find_subbox(stbl, b"stsd") {
                                if stsd.len() > 16 {
                                    if let Some(mp4a) = find_subbox(&stsd[8..], b"mp4a") {
                                        if mp4a.len() >= 28 {
                                            let ch = read_u16_be(mp4a, 16) as u8;
                                            let sr = read_u16_be(mp4a, 24) as u32;
                                            if (1..=6).contains(&ch) {
                                                channels = ch;
                                            }
                                            if (8000..=96000).contains(&sr) {
                                                sample_rate = sr;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if tag == b"moof" {
            last_moof_sizes.clear();
            if let Some(traf) = find_subbox(body, b"traf") {
                let mut default_size = 0usize;
                if let Some(tfhd) = find_subbox(traf, b"tfhd") {
                    if tfhd.len() >= 8 {
                        let tf_flags = read_u32_be(tfhd, 0) & 0x00FF_FFFF;
                        let mut p = 8usize;
                        if (tf_flags & 0x01) != 0 {
                            p += 8;
                        }
                        if (tf_flags & 0x02) != 0 {
                            p += 4;
                        }
                        if (tf_flags & 0x08) != 0 {
                            p += 4;
                        }
                        if (tf_flags & 0x10) != 0 && p + 4 <= tfhd.len() {
                            default_size = read_u32_be(tfhd, p) as usize;
                        }
                    }
                }
                if let Some(trun) = find_subbox(traf, b"trun") {
                    if trun.len() >= 8 {
                        let tr_flags = read_u32_be(trun, 0) & 0x00FF_FFFF;
                        let count = read_u32_be(trun, 4) as usize;
                        let mut p = 8usize;
                        if (tr_flags & 0x01) != 0 {
                            p += 4;
                        }
                        if (tr_flags & 0x04) != 0 {
                            p += 4;
                        }
                        for _ in 0..count {
                            if (tr_flags & 0x100) != 0 {
                                p += 4;
                            }
                            let s_sz = if (tr_flags & 0x200) != 0 && p + 4 <= trun.len() {
                                let v = read_u32_be(trun, p) as usize;
                                p += 4;
                                v
                            } else {
                                default_size
                            };
                            if (tr_flags & 0x400) != 0 {
                                p += 4;
                            }
                            if (tr_flags & 0x800) != 0 {
                                p += 4;
                            }
                            if s_sz > 0 {
                                last_moof_sizes.push(s_sz);
                            }
                        }
                    }
                }
            }
        } else if tag == b"mdat" && !last_moof_sizes.is_empty() {
            let sr_idx = sr_to_adts_index(sample_rate);
            let ch = channels.min(7);
            let mut m_off = 0usize;
            for &s_sz in &last_moof_sizes {
                if m_off + s_sz > body.len() {
                    break;
                }
                let aac_len = s_sz + 7;
                let hdr = [
                    0xFF,
                    0xF1,
                    0x40 | (sr_idx << 2) | (ch >> 2),
                    ((ch & 0x03) << 6) | ((aac_len >> 11) as u8 & 0x03),
                    ((aac_len >> 3) & 0xFF) as u8,
                    (((aac_len & 0x07) << 5) as u8) | 0x1F,
                    0xFC,
                ];
                out.extend_from_slice(&hdr);
                out.extend_from_slice(&body[m_off..m_off + s_sz]);
                m_off += s_sz;
            }
            last_moof_sizes.clear();
        }

        off += sz;
    }

    if has_moov && out.len() > 2048 {
        Some(out)
    } else {
        None
    }
}

fn looks_like_audio(bytes: &[u8]) -> bool {
    if bytes.len() < 16 {
        return false;
    }
    if bytes.starts_with(b"ID3") || bytes.starts_with(b"OggS") || bytes.starts_with(b"fLaC") {
        return true;
    }
    if bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0 {
        return true;
    }
    false
}

pub async fn resolve_and_download(
    client: &Client,
    cache_dir: &Path,
    client_id: &str,
    external_id: &str,
    track_id: &str,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let safe_id: String = track_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();

    for ext in ["mp3", "aac"] {
        let candidate = cache_dir.join(format!("{}.{}", safe_id, ext));
        if candidate.exists() {
            if let Ok(bytes) = std::fs::read(&candidate) {
                if bytes.len() > 2048 && looks_like_audio(&bytes) {
                    return Ok(candidate);
                }
            }
            let _ = std::fs::remove_file(&candidate);
        }
    }

    let old_m4a = cache_dir.join(format!("{}.m4a", safe_id));
    if old_m4a.exists() {
        if let Ok(bytes) = std::fs::read(&old_m4a) {
            if let Some(adts) = fmp4_to_adts_aac(&bytes) {
                let aac_path = cache_dir.join(format!("{}.aac", safe_id));
                if std::fs::write(&aac_path, &adts).is_ok() {
                    let _ = std::fs::remove_file(&old_m4a);
                    return Ok(aac_path);
                }
            }
        }
        let _ = std::fs::remove_file(&old_m4a);
    }

    let resp = client
        .get(format!("{}/tracks/{}", SC_API, external_id))
        .query(&[("client_id", client_id)])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("SoundCloud track HTTP {}", resp.status()));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let transcodings = json
        .get("media")
        .and_then(|m| m.get("transcodings"))
        .and_then(|t| t.as_array())
        .ok_or_else(|| "No SoundCloud streams available".to_string())?;

    let progressive = transcodings.iter().find(|t| {
        t.get("format")
            .and_then(|f| f.get("protocol"))
            .and_then(|p| p.as_str())
            == Some("progressive")
    });

    let hls_mpeg = transcodings.iter().find(|t| {
        let proto = t
            .get("format")
            .and_then(|f| f.get("protocol"))
            .and_then(|p| p.as_str());
        let mime = t
            .get("format")
            .and_then(|f| f.get("mime_type"))
            .and_then(|m| m.as_str())
            .unwrap_or("");
        proto == Some("hls") && mime.contains("mpeg")
    });

    let hls_mp4 = transcodings.iter().find(|t| {
        let proto = t
            .get("format")
            .and_then(|f| f.get("protocol"))
            .and_then(|p| p.as_str());
        let mime = t
            .get("format")
            .and_then(|f| f.get("mime_type"))
            .and_then(|m| m.as_str())
            .unwrap_or("");
        proto == Some("hls") && mime.contains("mp4")
    });

    let chosen = progressive
        .or(hls_mpeg)
        .or(hls_mp4)
        .or_else(|| {
            transcodings.iter().find(|t| {
                let p = t
                    .get("format")
                    .and_then(|f| f.get("protocol"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                !p.contains("encrypted")
            })
        })
        .ok_or_else(|| "Track is DRM-protected on SoundCloud".to_string())?;

    let is_hls = chosen
        .get("format")
        .and_then(|f| f.get("protocol"))
        .and_then(|p| p.as_str())
        == Some("hls");
    let mime = chosen
        .get("format")
        .and_then(|f| f.get("mime_type"))
        .and_then(|m| m.as_str())
        .unwrap_or("");
    let ext = if mime.contains("mp4") { "m4a" } else { "mp3" };

    let stream_api = chosen
        .get("url")
        .and_then(|u| u.as_str())
        .ok_or_else(|| "Missing transcoding URL".to_string())?;

    let resolved: Value = client
        .get(stream_api)
        .query(&[("client_id", client_id)])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let final_url = resolved
        .get("url")
        .and_then(|u| u.as_str())
        .ok_or_else(|| "Missing final SoundCloud stream URL".to_string())?;

    let out_path = cache_dir.join(format!("{}.{}", safe_id, ext));
    let tmp_path = cache_dir.join(format!("{}.{}.tmp", safe_id, ext));

    if !is_hls {
        let bytes = client
            .get(final_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        std::fs::write(&tmp_path, &bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp_path, &out_path).map_err(|e| e.to_string())?;
        return Ok(out_path);
    }

    let m3u8_text = client
        .get(final_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let base_url = reqwest::Url::parse(final_url).ok();
    let mut seg_urls: Vec<String> = Vec::new();

    for line in m3u8_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("#EXT-X-MAP:URI=\"") {
            if let Some(uri) = rest.split('"').next() {
                if let Some(ref b) = base_url {
                    if let Ok(u) = b.join(uri) {
                        seg_urls.push(u.to_string());
                    }
                }
            }
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            seg_urls.push(trimmed.to_string());
        } else if let Some(ref b) = base_url {
            if let Ok(u) = b.join(trimmed) {
                seg_urls.push(u.to_string());
            }
        }
    }

    if seg_urls.is_empty() {
        return Err("Empty SoundCloud HLS playlist".to_string());
    }

    if let Some(sub_url) = seg_urls.iter().find(|u| u.contains(".m3u8")).cloned() {
        let sub_text = client
            .get(&sub_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        let sub_base = reqwest::Url::parse(&sub_url).ok();
        seg_urls.clear();
        for line in sub_text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("#EXT-X-MAP:URI=\"") {
                if let Some(uri) = rest.split('"').next() {
                    if let Some(ref b) = sub_base {
                        if let Ok(u) = b.join(uri) {
                            seg_urls.push(u.to_string());
                        }
                    }
                }
                continue;
            }
            if trimmed.starts_with('#') {
                continue;
            }
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                seg_urls.push(trimmed.to_string());
            } else if let Some(ref b) = sub_base {
                if let Ok(u) = b.join(trimmed) {
                    seg_urls.push(u.to_string());
                }
            }
        }
    }

    let mut combined = Vec::with_capacity(seg_urls.len() * 24_000);
    for seg in seg_urls {
        let seg_resp = client.get(&seg).send().await.map_err(|e| e.to_string())?;
        if seg_resp.status().is_success() {
            let bytes = seg_resp.bytes().await.map_err(|e| e.to_string())?;
            combined.extend_from_slice(&bytes);
        }
    }

    if combined.first() == Some(&0x47) {
        let demuxed = demux_mpeg_ts(&combined);
        if !demuxed.is_empty() {
            combined = demuxed;
        }
    }

    if combined.len() >= 8 && &combined[4..8] == b"ftyp" {
        if let Some(adts) = fmp4_to_adts_aac(&combined) {
            let aac_path = cache_dir.join(format!("{}.aac", safe_id));
            std::fs::write(&tmp_path, &adts).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp_path, &aac_path).map_err(|e| e.to_string())?;
            return Ok(aac_path);
        }
    }

    if combined.len() < 1024 || !looks_like_audio(&combined) {
        return Err("SoundCloud stream format is unsupported for direct playback".to_string());
    }

    let final_out = cache_dir.join(format!("{}.{}", safe_id, ext));
    std::fs::write(&tmp_path, &combined).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &final_out).map_err(|e| e.to_string())?;
    Ok(final_out)
}

fn parse_track(v: &Value, liked: bool) -> Option<Track> {
    let ext_id = v.get("id").and_then(|x| x.as_i64()).map(|n| n.to_string())?;
    let title = v.get("title").and_then(|x| x.as_str())?.to_string();
    let artist = v
        .get("user")
        .and_then(|u| u.get("username"))
        .and_then(|n| n.as_str())
        .unwrap_or("SoundCloud Artist")
        .to_string();
    let duration_ms = v.get("duration").and_then(|d| d.as_u64()).unwrap_or(0);
    let cover_url = v
        .get("artwork_url")
        .and_then(|u| u.as_str())
        .map(|s| s.replace("-large", "-t500x500"));
    let permalink = v.get("permalink_url").and_then(|u| u.as_str()).map(str::to_string);
    let added_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    Some(Track {
        id: format!("soundcloud_{}", ext_id),
        source: SourceKind::SoundCloud,
        external_id: ext_id,
        title,
        artist,
        album: "SoundCloud".to_string(),
        duration_ms,
        cover_url,
        stream_url: permalink,
        local_path: None,
        codec: Some("MP3".to_string()),
        bitrate_kbps: Some(128),
        sample_rate_hz: Some(44100),
        liked,
        added_at,
    })
}
