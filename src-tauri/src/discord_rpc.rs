use parking_lot::Mutex;
use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_DISCORD_APP_ID: &str = "1575483583013982429";

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

pub fn update_presence(
    enabled: bool,
    app_id: &str,
    title: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
    cover_url: Option<&str>,
    is_playing: bool,
    position_ms: u64,
    duration_ms: u64,
    source: &str,
) {
    let clean_id = if app_id.trim().is_empty() {
        DEFAULT_DISCORD_APP_ID
    } else {
        app_id.trim()
    };
    let mut guard = RPC_CONN.lock();

    if !enabled || clean_id.is_empty() || title.is_none() {
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
        if !enabled || clean_id.is_empty() {
            *guard = None;
        }
        return;
    }

    if !ensure_connected(&mut guard, clean_id) {
        return;
    }

    let track_title = title.unwrap_or("Awase");
    let track_artist = artist.filter(|a| !a.is_empty()).unwrap_or("Unknown Artist");
    let now_sec = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut activity = json!({
        "type": 2,
        "details": track_title,
        "state": format!("by {}", track_artist),
        "assets": {
            "large_text": album.filter(|a| !a.is_empty()).unwrap_or("Awase Player"),
            "small_text": format!("Awase · {}", source)
        }
    });

    if let Some(url) = cover_url.filter(|u| u.starts_with("https://") && u.len() < 256) {
        activity["assets"]["large_image"] = json!(url);
    }

    if is_playing && duration_ms > 0 {
        let pos_sec = position_ms / 1000;
        let dur_sec = duration_ms / 1000;
        let start_ts = now_sec.saturating_sub(pos_sec);
        let end_ts = start_ts.saturating_add(dur_sec);
        activity["timestamps"] = json!({
            "start": start_ts,
            "end": end_ts
        });
    }

    let payload = json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": activity
        },
        "nonce": format!("awase-{}", now_sec)
    });

    if let Some(ref mut sess) = *guard {
        if write_frame(&mut sess.pipe, 1, &payload).is_err() {
            *guard = None;
        } else if let Ok(op) = read_frame(&mut sess.pipe) {
            if op == 2 {
                *guard = None;
            }
        }
    }
}
