use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use parking_lot::Mutex;
use reqwest::Client;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::models::{AudioTelemetry, Track};

struct SpotifyPlaybackState {
    active: bool,
    is_playing: bool,
    position_ms: u64,
    duration_ms: u64,
    track_id: Option<String>,
    device_id: Option<String>,
    token: Option<String>,
    error: Option<String>,
    last_update_ts: u64,
}

static SP_STATE: Mutex<SpotifyPlaybackState> = Mutex::new(SpotifyPlaybackState {
    active: false,
    is_playing: false,
    position_ms: 0,
    duration_ms: 0,
    track_id: None,
    device_id: None,
    token: None,
    error: None,
    last_update_ts: 0,
});

static SERVER_STARTED: AtomicBool = AtomicBool::new(false);
static READY_NOTIFY: OnceLock<tokio::sync::Notify> = OnceLock::new();

fn notify_ready() -> &'static tokio::sync::Notify {
    READY_NOTIFY.get_or_init(tokio::sync::Notify::new)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SdkReport {
    kind: String,
    device_id: Option<String>,
    message: Option<String>,
    is_playing: Option<bool>,
    position_ms: Option<u64>,
    duration_ms: Option<u64>,
    ended: Option<bool>,
}

const SDK_HTML: &str = r#"<!doctype html>
<html>
<head><meta charset="utf-8"><title>Awase Spotify Player</title></head>
<body style="background:#000;color:#fff;margin:0">
<script src="https://sdk.scdn.co/spotify-player.js"></script>
<script>
(function(){
  var player = null;
  var currentToken = "";
  var currentVol = 0.8;
  var lastPaused = true;
  var lastPos = 0;

  function report(obj) {
    try {
      fetch("http://127.0.0.1:43823/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(obj)
      }).catch(function(){});
    } catch(e) {}
  }

  window.onSpotifyWebPlaybackSDKReady = function() {
    initPlayer();
  };

  function initPlayer() {
    if (player || !window.Spotify || !currentToken) return;
    player = new window.Spotify.Player({
      name: "Awase",
      getOAuthToken: function(cb) { cb(currentToken); },
      volume: currentVol
    });

    player.addListener("ready", function(d) {
      report({ kind: "ready", deviceId: d.device_id });
    });
    player.addListener("not_ready", function() {
      report({ kind: "not_ready" });
    });
    player.addListener("initialization_error", function(e) {
      report({ kind: "error", message: e && e.message ? e.message : "Initialization error" });
    });
    player.addListener("authentication_error", function(e) {
      report({ kind: "error", message: e && e.message ? e.message : "Authentication error" });
    });
    player.addListener("account_error", function() {
      report({ kind: "error", message: "Spotify Premium required" });
    });
    player.addListener("playback_error", function(e) {
      report({ kind: "error", message: e && e.message ? e.message : "Playback error" });
    });
    player.addListener("player_state_changed", function(st) {
      if (!st) return;
      var ended = !lastPaused && st.paused && st.position === 0 && lastPos > 2000;
      lastPaused = st.paused;
      lastPos = st.position || 0;
      report({
        kind: "state",
        isPlaying: !st.paused,
        positionMs: st.position || 0,
        durationMs: st.duration || 0,
        ended: ended
      });
    });

    player.connect();
  }

  setInterval(function() {
    if (!player) return;
    player.getCurrentState().then(function(st) {
      if (!st) return;
      report({
        kind: "state",
        isPlaying: !st.paused,
        positionMs: st.position || 0,
        durationMs: st.duration || 0,
        ended: false
      });
    }).catch(function(){});
  }, 500);

  window.__awaseSpSetToken = function(tok, vol) {
    currentToken = tok;
    currentVol = typeof vol === "number" ? vol : currentVol;
    if (!player && window.Spotify) {
      initPlayer();
    } else if (player) {
      player.setVolume(currentVol).catch(function(){});
    }
  };
  window.__awaseSpPause = function() {
    if (player) player.pause().catch(function(){});
  };
  window.__awaseSpResume = function() {
    if (player) player.resume().catch(function(){});
  };
  window.__awaseSpSeek = function(ms) {
    if (player) player.seek(ms).catch(function(){});
  };
  window.__awaseSpVol = function(v) {
    currentVol = v;
    if (player) player.setVolume(v).catch(function(){});
  };
})();
</script>
</body>
</html>"#;

fn ensure_server(app: AppHandle) {
    if SERVER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let Ok(listener) = TcpListener::bind("127.0.0.1:43823").await else {
            return;
        };
        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                continue;
            };
            let app_c = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut buf = [0u8; 8192];
                let Ok(n) = stream.read(&mut buf).await else {
                    return;
                };
                let req = String::from_utf8_lossy(&buf[..n]);
                let first = req.lines().next().unwrap_or("");
                let is_post = first.starts_with("POST ");

                if is_post {
                    if let Some((_, body)) = req.split_once("\r\n\r\n") {
                        if let Ok(rep) = serde_json::from_str::<SdkReport>(body.trim()) {
                            let mut emit_ended = false;
                            {
                                let mut st = SP_STATE.lock();
                                match rep.kind.as_str() {
                                    "ready" => {
                                        st.device_id = rep.device_id;
                                        st.error = None;
                                        notify_ready().notify_waiters();
                                    }
                                    "error" => {
                                        st.error = rep.message;
                                        notify_ready().notify_waiters();
                                    }
                                    "state" => {
                                        if let Some(ip) = rep.is_playing {
                                            st.is_playing = ip;
                                        }
                                        if let Some(p) = rep.position_ms {
                                            st.position_ms = p;
                                        }
                                        if let Some(d) = rep.duration_ms {
                                            if d > 0 {
                                                st.duration_ms = d;
                                            }
                                        }
                                        st.last_update_ts = now_ms();
                                        if rep.ended == Some(true) && st.active {
                                            emit_ended = true;
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            if emit_ended {
                                let _ = app_c.emit("awase://track-ended", ());
                            }
                        }
                    }
                    let resp = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";
                    let _ = stream.write_all(resp.as_bytes()).await;
                    return;
                }

                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    SDK_HTML.len(),
                    SDK_HTML
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            });
        }
    });
}

async fn ensure_window(app: &AppHandle, token: &str, volume: f32) -> Result<String, String> {
    ensure_server(app.clone());
    if app.get_webview_window("sp_player").is_none() {
        let url = tauri::Url::parse("http://127.0.0.1:43823/").map_err(|e| e.to_string())?;
        tauri::WebviewWindowBuilder::new(app, "sp_player", tauri::WebviewUrl::External(url))
            .title("Awase Spotify Engine")
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?;
        tokio::time::sleep(std::time::Duration::from_millis(450)).await;
    }

    if let Some(w) = app.get_webview_window("sp_player") {
        let tok_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string());
        let _ = w.eval(&format!("window.__awaseSpSetToken && window.__awaseSpSetToken({}, {});", tok_json, volume));
    }

    for _ in 0..16 {
        {
            let st = SP_STATE.lock();
            if let Some(err) = &st.error {
                return Err(err.clone());
            }
            if let Some(dev) = &st.device_id {
                return Ok(dev.clone());
            }
        }
        if let Some(w) = app.get_webview_window("sp_player") {
            let tok_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string());
            let _ = w.eval(&format!("window.__awaseSpSetToken && window.__awaseSpSetToken({}, {});", tok_json, volume));
        }
        let _ = tokio::time::timeout(
            std::time::Duration::from_millis(450),
            notify_ready().notified(),
        )
        .await;
    }

    Err("Spotify Web Playback SDK did not initialize (Premium required)".to_string())
}

pub async fn play_track(
    app: &AppHandle,
    client: &Client,
    token: &str,
    track: &Track,
    volume: f32,
) -> Result<(), String> {
    let device_id = ensure_window(app, token, volume).await?;

    let resp = client
        .put("https://api.spotify.com/v1/me/player/play")
        .bearer_auth(token)
        .query(&[("device_id", device_id.as_str())])
        .json(&serde_json::json!({
            "uris": [format!("spotify:track:{}", track.external_id)]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        if code == 403 || body.contains("PREMIUM_REQUIRED") {
            return Err("Для воспроизведения Spotify требуется подписка Spotify Premium".to_string());
        }
        return Err(format!("Spotify play HTTP {}: {}", code, body));
    }

    let mut st = SP_STATE.lock();
    st.active = true;
    st.is_playing = true;
    st.position_ms = 0;
    st.duration_ms = track.duration_ms;
    st.track_id = Some(track.id.clone());
    st.token = Some(token.to_string());
    st.last_update_ts = now_ms();
    Ok(())
}

pub fn is_active() -> bool {
    SP_STATE.lock().active
}

pub fn stop(app: &AppHandle) {
    let mut st = SP_STATE.lock();
    if st.active {
        st.active = false;
        st.is_playing = false;
        st.position_ms = 0;
        if let Some(w) = app.get_webview_window("sp_player") {
            let _ = w.eval("window.__awaseSpPause && window.__awaseSpPause();");
        }
    }
}

pub fn pause(app: &AppHandle) {
    let mut st = SP_STATE.lock();
    st.is_playing = false;
    if let Some(w) = app.get_webview_window("sp_player") {
        let _ = w.eval("window.__awaseSpPause && window.__awaseSpPause();");
    }
}

pub fn resume(app: &AppHandle) {
    let mut st = SP_STATE.lock();
    st.is_playing = true;
    st.last_update_ts = now_ms();
    if let Some(w) = app.get_webview_window("sp_player") {
        let _ = w.eval("window.__awaseSpResume && window.__awaseSpResume();");
    }
}

pub fn seek(app: &AppHandle, position_ms: u64) {
    let mut st = SP_STATE.lock();
    st.position_ms = position_ms;
    st.last_update_ts = now_ms();
    if let Some(w) = app.get_webview_window("sp_player") {
        let _ = w.eval(&format!("window.__awaseSpSeek && window.__awaseSpSeek({});", position_ms));
    }
}

pub fn set_volume(app: &AppHandle, volume: f32) {
    if let Some(w) = app.get_webview_window("sp_player") {
        let _ = w.eval(&format!("window.__awaseSpVol && window.__awaseSpVol({});", volume.clamp(0.0, 1.0)));
    }
}

pub fn overlay_telemetry(base: AudioTelemetry) -> AudioTelemetry {
    let st = SP_STATE.lock();
    if !st.active {
        return base;
    }
    let elapsed = if st.is_playing && st.last_update_ts > 0 {
        now_ms().saturating_sub(st.last_update_ts).min(1500)
    } else {
        0
    };
    let pos = (st.position_ms + elapsed).min(st.duration_ms.max(st.position_ms + elapsed));
    let mut spec = [0.0f32; 32];
    if st.is_playing {
        let t = now_ms() as f32 * 0.004;
        for (i, v) in spec.iter_mut().enumerate() {
            let wave = ((t + i as f32 * 0.45).sin() * 0.5 + 0.5) * 0.42;
            *v = (0.12 + wave).min(0.85);
        }
    }
    AudioTelemetry {
        is_playing: st.is_playing,
        current_track_id: st.track_id.clone(),
        position_ms: pos,
        duration_ms: st.duration_ms,
        sample_rate_hz: 44100,
        channels: 2,
        codec: "SPOTIFY".to_string(),
        bitrate_kbps: 256,
        device_name: base.device_name,
        volume: base.volume,
        muted: base.muted,
        spectrum: spec.to_vec(),
        rms_left: if st.is_playing { 0.35 } else { 0.0 },
        rms_right: if st.is_playing { 0.35 } else { 0.0 },
        peak: if st.is_playing { 0.45 } else { 0.0 },
    }
}
