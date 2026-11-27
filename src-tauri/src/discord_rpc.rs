use parking_lot::Mutex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_DISCORD_APP_ID: &str = "1575483583013982429";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPresencePayload {
    pub enabled: bool,
    pub app_id: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub cover_url: Option<String>,
    pub external_id: Option<String>,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub source: String,
    #[serde(default)]
    pub codec: String,
    #[serde(default)]
    pub bitrate_kbps: u32,
    #[serde(default)]
    pub sample_rate_hz: u32,
    #[serde(default)]
    pub active_view: String,
    #[serde(default)]
    pub lyric_line: Option<String>,
    #[serde(default)]
    pub rpc_style: String,
    #[serde(default = "default_true")]
    pub rpc_show_idle: bool,
    #[serde(default = "default_true")]
    pub rpc_show_paused: bool,
    #[serde(default)]
    pub rpc_hide_on_pause: bool,
    #[serde(default = "default_true")]
    pub rpc_show_buttons: bool,
    #[serde(default = "default_true")]
    pub rpc_show_timestamps: bool,
    #[serde(default = "default_true")]
    pub rpc_show_source: bool,
    #[serde(default)]
    pub rpc_idle_text: String,
}

fn default_true() -> bool {
    true
}

struct RpcSession {
    pipe: File,
    app_id: String,
}

static RPC_CONN: Mutex<Option<RpcSession>> = Mutex::new(None);

fn write_frame(pipe: &mut File, opcode: u32, payload: &Value) -> Result<(), String> {
    let body = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
    let mut frame = Vec::with_capacity(8 + body.len());
    frame.extend_from_slice(&opcode.to_le_bytes());
    frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
    frame.extend_from_slice(&body);
    pipe.write_all(&frame).map_err(|e| e.to_string())?;
    pipe.flush().map_err(|e| e.to_string())
}

fn read_frame(pipe: &mut File) -> Result<u32, String> {
    let mut header = [0u8; 8];
    pipe.read_exact(&mut header).map_err(|e| e.to_string())?;
    let op = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    if len > 0 && len < 65536 {
        let mut buf = vec![0u8; len];
        pipe.read_exact(&mut buf).map_err(|e| e.to_string())?;
    }
    Ok(op)
}

fn ensure_connected(guard: &mut Option<RpcSession>, app_id: &str) -> bool {
    if let Some(ref sess) = *guard {
        if sess.app_id == app_id {
            return true;
        }
        *guard = None;
    }

    for idx in 0..10 {
        let pipe_path = format!(r"\\.\pipe\discord-ipc-{}", idx);
        if let Ok(mut file) = OpenOptions::new().read(true).write(true).open(&pipe_path) {
            let handshake = json!({
                "v": 1,
                "client_id": app_id
            });
            if write_frame(&mut file, 0, &handshake).is_ok() {
                if let Ok(op) = read_frame(&mut file) {
                    if op == 1 {
                        *guard = Some(RpcSession {
                            pipe: file,
                            app_id: app_id.to_string(),
                        });
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn clear_activity(guard: &mut Option<RpcSession>) {
    if let Some(ref mut sess) = *guard {
        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": std::process::id(),
                "activity": Value::Null
            },
            "nonce": format!("awase-clear-{}", std::process::id())
        });
        if write_frame(&mut sess.pipe, 1, &payload).is_err() {
            *guard = None;
        } else {
            let _ = read_frame(&mut sess.pipe);
        }
    }
}

fn fmt_mmss(ms: u64) -> String {
    let total_sec = ms / 1000;
    format!("{:02}:{:02}", total_sec / 60, total_sec % 60)
}

fn truncate_str(s: &str, max_chars: usize) -> String {
    let trimmed = s.trim();
    if trimmed.chars().count() <= max_chars {
        trimmed.to_string()
    } else {
        let mut out: String = trimmed.chars().take(max_chars.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}

fn pretty_source(src: &str) -> &'static str {
    match src {
        "yandex" => "Yandex Music",
        "spotify" => "Spotify",
        "soundcloud" => "SoundCloud",
        _ => "Local Vault",
    }
}

fn track_external_url(source: &str, external_id: Option<&str>) -> Option<String> {
    let ext = external_id?.trim();
    if ext.is_empty() {
        return None;
    }
    if ext.starts_with("https://") {
        return Some(ext.to_string());
    }
    match source {
        "spotify" => Some(format!("https://open.spotify.com/track/{}", ext)),
        "yandex" => Some(format!("https://music.yandex.ru/track/{}", ext)),
        _ => None,
    }
}

fn build_buttons(source: &str, external_id: Option<&str>) -> Value {
    if let Some(url) = track_external_url(source, external_id) {
        let label = match source {
            "spotify" => "Listen on Spotify",
            "yandex" => "Open in Yandex",
            _ => "Open Track",
        };
        json!([
            { "label": label, "url": url },
            { "label": "Awase Player", "url": "https://github.com/Mono-no-Awares/Awase/releases" }
        ])
    } else {
        json!([
            { "label": "Download Awase", "url": "https://github.com/Mono-no-Awares/Awase/releases" },
            { "label": "GitHub", "url": "https://github.com/Mono-no-Awares/Awase" }
        ])
    }
}

pub fn update_presence(opts: DiscordPresencePayload) {
    let clean_id = if opts.app_id.trim().is_empty() {
        DEFAULT_DISCORD_APP_ID.to_string()
    } else {
        opts.app_id.trim().to_string()
    };
    let mut guard = RPC_CONN.lock();

    if !opts.enabled || clean_id.is_empty() {
        clear_activity(&mut guard);
        *guard = None;
        return;
    }

    let has_track = opts.title.as_deref().is_some_and(|t| !t.trim().is_empty());

    if !has_track && !opts.rpc_show_idle {
        clear_activity(&mut guard);
        return;
    }

    if has_track && !opts.is_playing && opts.rpc_hide_on_pause {
        clear_activity(&mut guard);
        return;
    }

    if has_track && !opts.is_playing && !opts.rpc_show_paused && !opts.rpc_show_idle {
        clear_activity(&mut guard);
        return;
    }

    if !ensure_connected(&mut guard, &clean_id) {
        return;
    }

    let now_sec = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut activity = if !has_track || (!opts.is_playing && !opts.rpc_show_paused) {
        let idle_detail = if !opts.rpc_idle_text.trim().is_empty() {
            truncate_str(&opts.rpc_idle_text, 120)
        } else {
            match opts.active_view.as_str() {
                "resonance" => "Vibing in Resonance · Aura".to_string(),
                "lyrics" => "Reading Lyrics".to_string(),
                "library" => "Browsing Music Library".to_string(),
                "wrapped" => "Viewing Awase Wrapped".to_string(),
                "settings" => "Customizing Awase".to_string(),
                _ => "Chilling on Awase Stage".to_string(),
            }
        };
        json!({
            "type": 2,
            "details": idle_detail,
            "state": "Idle · Awase Player",
            "assets": {
                "large_text": "Awase Music Player"
            }
        })
    } else {
        let track_title = truncate_str(opts.title.as_deref().unwrap_or("Awase"), 120);
        let track_artist = opts
            .artist
            .as_deref()
            .filter(|a| !a.trim().is_empty())
            .unwrap_or("Unknown Artist");
        let album_str = opts
            .album
            .as_deref()
            .filter(|a| !a.trim().is_empty())
            .unwrap_or("");

        let state_text = if !opts.is_playing {
            if opts.duration_ms > 0 {
                format!(
                    "Paused · {} ({} / {})",
                    track_artist,
                    fmt_mmss(opts.position_ms),
                    fmt_mmss(opts.duration_ms)
                )
            } else {
                format!("Paused · {}", track_artist)
            }
        } else {
            match opts.rpc_style.as_str() {
                "minimal" => track_artist.to_string(),
                "audiophile" => {
                    let codec = if opts.codec.trim().is_empty() {
                        "AUDIO"
                    } else {
                        opts.codec.trim()
                    };
                    if opts.bitrate_kbps > 0 {
                        format!("{} · {} {} kbps", track_artist, codec, opts.bitrate_kbps)
                    } else if opts.sample_rate_hz > 0 {
                        format!(
                            "{} · {} {:.1} kHz",
                            track_artist,
                            codec,
                            opts.sample_rate_hz as f32 / 1000.0
                        )
                    } else {
                        format!("{} · {}", track_artist, codec)
                    }
                }
                "lyrics" => {
                    if let Some(line) = opts.lyric_line.as_deref().filter(|l| !l.trim().is_empty()) {
                        format!("♪ {}", line.trim())
                    } else if !album_str.is_empty() {
                        format!("{} · {}", track_artist, album_str)
                    } else {
                        track_artist.to_string()
                    }
                }
                _ => {
                    if !album_str.is_empty() {
                        format!("{} · {}", track_artist, album_str)
                    } else {
                        track_artist.to_string()
                    }
                }
            }
        };

        let large_text = if opts.rpc_style == "audiophile" && !album_str.is_empty() {
            format!("{} · {}", album_str, pretty_source(&opts.source))
        } else if !album_str.is_empty() {
            album_str.to_string()
        } else {
            "Awase Player".to_string()
        };

        let mut act = json!({
            "type": 2,
            "details": track_title,
            "state": truncate_str(&state_text, 120),
            "assets": {
                "large_text": truncate_str(&large_text, 120),
                "small_text": if opts.is_playing {
                    if opts.rpc_show_source {
                        format!("Awase · {}", pretty_source(&opts.source))
                    } else {
                        "Playing in Awase".to_string()
                    }
                } else {
                    "Paused".to_string()
                }
            }
        });

        let normalized_cover = opts.cover_url.as_deref().map(|u| {
            if let Some(rest) = u.strip_prefix("http://") {
                format!("https://{}", rest)
            } else {
                u.to_string()
            }
        });
        if let Some(url) = normalized_cover
            .as_deref()
            .filter(|u| u.starts_with("https://") && u.len() < 512)
        {
            act["assets"]["large_image"] = json!(url);
        }

        if opts.is_playing && opts.rpc_show_timestamps && opts.duration_ms > 0 {
            let pos_sec = opts.position_ms / 1000;
            let dur_sec = opts.duration_ms / 1000;
            let start_ts = now_sec.saturating_sub(pos_sec);
            let end_ts = start_ts.saturating_add(dur_sec);
            act["timestamps"] = json!({
                "start": start_ts,
                "end": end_ts
            });
        }

        act
    };

    if opts.rpc_show_buttons {
        activity["buttons"] = build_buttons(
            &opts.source,
            if has_track { opts.external_id.as_deref() } else { None },
        );
    }

    let payload = json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": activity
        },
        "nonce": format!("awase-set-{}", now_sec)
    });

    if let Some(ref mut sess) = *guard {
        if write_frame(&mut sess.pipe, 1, &payload).is_err() {
            *guard = None;
        } else {
            let _ = read_frame(&mut sess.pipe);
        }
    }
}
