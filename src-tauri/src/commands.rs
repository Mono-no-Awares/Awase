use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use parking_lot::Mutex;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

use crate::audio_engine::AudioEngine;
use crate::db::Database;
use crate::local_scanner;
use crate::lyrics::{self, LyricsPayload};
use crate::models::{
    AudioDevice, AudioTelemetry, EqualizerState, LocalFolder, OAuthEventPayload, Playlist,
    SourceKind, SourceStatus, Track,
};
use crate::providers::{self, soundcloud, spotify, yandex};

pub struct AppState {
    pub db: Arc<Database>,
    pub engine: Arc<AudioEngine>,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
    pub sys: Mutex<System>,
    pub play_seq: AtomicU64,
}

#[tauri::command]
pub fn get_library_tracks(
    state: State<'_, AppState>,
    source: Option<SourceKind>,
    query: Option<String>,
) -> Result<Vec<Track>, String> {
    state.db.get_tracks(source, query.as_deref())
}

#[tauri::command]
pub fn delete_tracks(state: State<'_, AppState>, track_ids: Vec<String>) -> Result<(), String> {
    state.db.delete_tracks(&track_ids)
}

#[tauri::command]
pub fn clear_library(
    state: State<'_, AppState>,
    scope: Option<String>,
    playlist_id: Option<String>,
) -> Result<(), String> {
    if let Some(pid) = playlist_id.filter(|s| !s.trim().is_empty()) {
        return state.db.clear_playlist_tracks(&pid);
    }
    match scope.as_deref() {
        Some("local") => state.db.delete_source_tracks(SourceKind::Local),
        Some("yandex") => state.db.delete_source_tracks(SourceKind::Yandex),
        Some("spotify") => state.db.delete_source_tracks(SourceKind::Spotify),
        Some("soundcloud") => state.db.delete_source_tracks(SourceKind::SoundCloud),
        Some("favorites") => state.db.clear_favorites(),
        _ => {
            state.engine.stop();
            state.db.clear_library()
        }
    }
}

#[tauri::command]
pub fn wipe_app_data(state: State<'_, AppState>, keep_credentials: bool) -> Result<(), String> {
    state.engine.stop();
    clear_dir_files(&state.cache_dir);
    state.db.wipe_all_data(keep_credentials)
}

#[tauri::command]
pub fn get_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>, String> {
    state.db.get_playlists()
}

#[tauri::command]
pub fn get_playlist_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Vec<Track>, String> {
    state.db.get_playlist_tracks(&playlist_id)
}

#[tauri::command]
pub fn create_playlist(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
) -> Result<Playlist, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let playlist = Playlist {
        id: format!("mix_{}", ts),
        name,
        source: SourceKind::Local,
        track_count: 0,
        cover_url: None,
        description,
    };
    state.db.upsert_playlist(&playlist)?;
    Ok(playlist)
}

#[tauri::command]
pub fn add_track_to_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track: Track,
) -> Result<(), String> {
    state.db.add_track_to_playlist(&playlist_id, &track)
}

#[tauri::command]
pub fn remove_track_from_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
) -> Result<(), String> {
    state.db.remove_track_from_playlist(&playlist_id, &track_id)
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, playlist_id: String) -> Result<(), String> {
    state.db.delete_playlist(&playlist_id)
}

#[tauri::command]
pub fn toggle_track_like(
    state: State<'_, AppState>,
    track_id: String,
    track: Option<Track>,
) -> Result<bool, String> {
    if let Some(ref tr) = track {
        let existing = state
            .db
            .get_tracks(None, None)
            .ok()
            .map(|list| list.into_iter().any(|x| x.id == track_id))
            .unwrap_or(false);
        if !existing {
            let _ = state.db.upsert_tracks(std::slice::from_ref(tr));
        }
    }
    let liked = state.db.toggle_like(&track_id)?;
    let info = track.or_else(|| {
        state
            .db
            .get_tracks(None, None)
            .ok()
            .and_then(|list| list.into_iter().find(|x| x.id == track_id))
    });
    if let Some(tr) = info {
        let http = state.http.clone();
        match tr.source {
            SourceKind::Yandex => {
                if let Ok(Some((Some(tok), _, _, _))) = state.db.get_credentials(SourceKind::Yandex) {
                    let ext = tr.external_id.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = yandex::set_track_like(&http, &tok, &ext, liked).await;
                        let fb = if liked { "like" } else { "unlike" };
                        yandex::send_wave_feedback(&http, &tok, fb, Some(&ext), None).await;
                    });
                }
            }
            SourceKind::SoundCloud => {
                if let Ok(Some((tok_opt, cid_opt, _, _))) =
                    state.db.get_credentials(SourceKind::SoundCloud)
                {
                    if let (Some(tok), Some(cid)) = (tok_opt, cid_opt) {
                        let ext = tr.external_id.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = soundcloud::set_track_like(
                                &http,
                                Some(tok.as_str()),
                                &cid,
                                &ext,
                                liked,
                            )
                            .await;
                        });
                    }
                }
            }
            _ => {}
        }
    }
    Ok(liked)
}

#[tauri::command]
pub async fn dislike_wave_track(state: State<'_, AppState>, track: Track) -> Result<(), String> {
    let key = format!(
        "{}|{}",
        track.title.trim().to_lowercase(),
        track.artist.trim().to_lowercase()
    );
    yandex::load_wave_seen(vec![track.external_id.clone(), key.clone()], None);
    soundcloud::load_wave_seen(vec![track.external_id.clone(), key.clone()]);
    let (mut combined, last_ym) = yandex::dump_wave_seen();
    combined.extend(soundcloud::dump_wave_seen());
    if let Ok(json_s) = serde_json::to_string(&combined) {
        let _ = state.db.save_setting("wave_seen_v1", &json_s);
    }
    if let Some(lid) = last_ym {
        let _ = state.db.save_setting("wave_last_track_id_v1", &lid);
    }
    if track.source == SourceKind::Yandex {
        if let Ok(Some((Some(tok), _, _, _))) = state.db.get_credentials(SourceKind::Yandex) {
            yandex::send_wave_feedback(
                &state.http,
                &tok,
                "dislike",
                Some(&track.external_id),
                Some(2.0),
            )
            .await;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_local_folders(state: State<'_, AppState>) -> Result<Vec<LocalFolder>, String> {
    state.db.get_local_folders()
}

#[tauri::command]
pub async fn add_local_folder(state: State<'_, AppState>, path: String) -> Result<usize, String> {
    let db = Arc::clone(&state.db);
    let scan_path = path.clone();
    let tracks = tokio::task::spawn_blocking(move || local_scanner::scan_folder(&scan_path))
        .await
        .map_err(|e| e.to_string())?;
    let count = tracks.len();
    db.upsert_tracks(&tracks)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    db.upsert_local_folder(&LocalFolder {
        path,
        track_count: count,
        last_scanned: now,
    })?;
    Ok(count)
}

#[tauri::command]
pub fn remove_local_folder(state: State<'_, AppState>, path: String) -> Result<(), String> {
    state.db.remove_local_folder(&path)
}

#[tauri::command]
pub async fn rescan_local_folders(state: State<'_, AppState>) -> Result<usize, String> {
    let folders = state.db.get_local_folders()?;
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let mut total = 0usize;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        for f in folders {
            let tracks = local_scanner::scan_folder(&f.path);
            let count = tracks.len();
            total += count;
            db.upsert_tracks(&tracks)?;
            db.upsert_local_folder(&LocalFolder {
                path: f.path,
                track_count: count,
                last_scanned: now,
            })?;
        }
        Ok::<usize, String>(total)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn play_track(app: AppHandle, state: State<'_, AppState>, track: Track) -> Result<(), String> {
    let seq = state.play_seq.fetch_add(1, Ordering::SeqCst) + 1;
    let codec_label = track.codec.clone().unwrap_or_else(|| "AUDIO".to_string());
    let bitrate = track.bitrate_kbps.unwrap_or(0);

    if track.source == SourceKind::Spotify {
        state.engine.stop();
        let token = state
            .db
            .get_credentials(SourceKind::Spotify)?
            .and_then(|c| c.0)
            .ok_or_else(|| "Подключите аккаунт Spotify".to_string())?;
        if state.play_seq.load(Ordering::SeqCst) != seq {
            return Ok(());
        }
        let vol = state.engine.get_telemetry().volume;
        return crate::spotify_player::play_track(&app, &state.http, &token, &track, vol).await;
    }

    crate::spotify_player::stop(&app);

    let file_path = match track.source {
        SourceKind::Local => {
            let p = track
                .local_path
                .clone()
                .ok_or_else(|| "Missing local file path".to_string())?;
            PathBuf::from(p)
        }
        SourceKind::Yandex => {
            let token = state
                .db
                .get_credentials(SourceKind::Yandex)?
                .and_then(|c| c.0)
                .ok_or_else(|| "Connect Yandex Music first".to_string())?;
            let fb_client = state.http.clone();
            let fb_token = token.clone();
            let fb_ext = track.external_id.clone();
            tauri::async_runtime::spawn(async move {
                yandex::send_wave_feedback(&fb_client, &fb_token, "trackStarted", Some(&fb_ext), None).await;
            });
            let (stream_url, _, ext) =
                yandex::resolve_stream_url(&state.http, &token, &track.external_id).await?;
            if state.play_seq.load(Ordering::SeqCst) != seq {
                return Ok(());
            }
            providers::download_to_cache(
                &state.http,
                &state.cache_dir,
                &track.id,
                &ext,
                &stream_url,
                None,
            )
            .await?
        }
        SourceKind::SoundCloud => {
            let creds = state.db.get_credentials(SourceKind::SoundCloud)?;
            let cached_cid = creds.as_ref().and_then(|c| c.1.as_deref());
            let cid = soundcloud::resolve_client_id(&state.http, cached_cid).await?;
            let _ = state
                .db
                .save_credentials(SourceKind::SoundCloud, None, Some(&cid), None, None);
            let out = soundcloud::resolve_and_download(
                &state.http,
                &state.cache_dir,
                &cid,
                &track.external_id,
                &track.id,
            )
            .await?;
            if soundcloud::get_ru_bypass_state().1 {
                let _ = state.db.save_setting("sc_ru_tripped", "true");
            }
            out
        }
        SourceKind::Spotify => unreachable!(),
    };

    if state.play_seq.load(Ordering::SeqCst) != seq {
        return Ok(());
    }

    state
        .engine
        .play_file(&track.id, file_path, track.duration_ms, &codec_label, bitrate)
}

#[tauri::command]
pub fn pause_playback(app: AppHandle, state: State<'_, AppState>) {
    if crate::spotify_player::is_active() {
        crate::spotify_player::pause(&app);
    } else {
        state.engine.pause();
    }
}

#[tauri::command]
pub fn resume_playback(app: AppHandle, state: State<'_, AppState>) {
    if crate::spotify_player::is_active() {
        crate::spotify_player::resume(&app);
    } else {
        state.engine.resume();
    }
}

#[tauri::command]
pub fn stop_playback(app: AppHandle, state: State<'_, AppState>) {
    crate::spotify_player::stop(&app);
    state.engine.stop();
}

#[tauri::command]
pub fn seek_playback(
    app: AppHandle,
    state: State<'_, AppState>,
    position_ms: u64,
) -> Result<(), String> {
    if crate::spotify_player::is_active() {
        crate::spotify_player::seek(&app, position_ms);
        Ok(())
    } else {
        state.engine.seek(position_ms)
    }
}

#[tauri::command]
pub fn set_volume(app: AppHandle, state: State<'_, AppState>, volume: f32) {
    state.engine.set_volume(volume);
    if crate::spotify_player::is_active() {
        crate::spotify_player::set_volume(&app, volume);
    }
    let _ = state.db.save_setting("volume", &volume.clamp(0.0, 1.0).to_string());
    let _ = state.db.save_setting("muted", "false");
}

#[tauri::command]
pub fn set_muted(app: AppHandle, state: State<'_, AppState>, muted: bool) {
    state.engine.set_muted(muted);
    if crate::spotify_player::is_active() {
        let vol = if muted {
            0.0
        } else {
            state.engine.get_telemetry().volume
        };
        crate::spotify_player::set_volume(&app, vol);
    }
    let _ = state
        .db
        .save_setting("muted", if muted { "true" } else { "false" });
}

#[tauri::command]
pub fn get_telemetry(state: State<'_, AppState>) -> AudioTelemetry {
    crate::spotify_player::overlay_telemetry(state.engine.get_telemetry())
}

#[tauri::command]
pub fn get_equalizer(state: State<'_, AppState>) -> Result<EqualizerState, String> {
    state.db.get_equalizer()
}

#[tauri::command]
pub fn set_equalizer(state: State<'_, AppState>, eq_state: EqualizerState) -> Result<(), String> {
    state.db.save_equalizer(&eq_state)?;
    state.engine.update_equalizer(eq_state);
    Ok(())
}

#[tauri::command]
pub fn get_audio_devices() -> Vec<AudioDevice> {
    AudioEngine::list_devices()
}

#[tauri::command]
pub fn set_audio_device(state: State<'_, AppState>, device_name: String) -> Result<(), String> {
    state.engine.set_output_device(&device_name)?;
    let _ = state.db.save_setting("audio_device", &device_name);
    Ok(())
}

#[tauri::command]
pub fn save_ui_prefs(state: State<'_, AppState>, prefs_json: String) -> Result<(), String> {
    state.db.save_setting("ui_prefs", &prefs_json)
}

#[tauri::command]
pub fn get_ui_prefs(state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.db.get_setting("ui_prefs")
}

#[tauri::command]
pub fn get_source_statuses(state: State<'_, AppState>) -> Result<Vec<SourceStatus>, String> {
    let folders = state.db.get_local_folders()?;
    let ym = state.db.get_credentials(SourceKind::Yandex)?;
    let sp = state.db.get_credentials(SourceKind::Spotify)?;
    let sc = state.db.get_credentials(SourceKind::SoundCloud)?;

    Ok(vec![
        SourceStatus {
            source: SourceKind::Local,
            connected: !folders.is_empty(),
            account_label: if folders.is_empty() {
                None
            } else {
                Some(format!("{} folders", folders.len()))
            },
            details: "Local folders".to_string(),
            has_credentials: true,
        },
        SourceStatus {
            source: SourceKind::Yandex,
            connected: ym.as_ref().and_then(|c| c.0.as_ref()).is_some(),
            account_label: ym.as_ref().and_then(|c| c.2.clone()),
            details: "Yandex Music".to_string(),
            has_credentials: ym.as_ref().and_then(|c| c.0.as_ref()).is_some(),
        },
        SourceStatus {
            source: SourceKind::Spotify,
            connected: sp.as_ref().and_then(|c| c.0.as_ref()).is_some(),
            account_label: sp.as_ref().and_then(|c| c.2.clone()),
            details: "Spotify".to_string(),
            has_credentials: sp.as_ref().and_then(|c| c.0.as_ref()).is_some(),
        },
        SourceStatus {
            source: SourceKind::SoundCloud,
            connected: sc
                .as_ref()
                .map(|c| {
                    c.0.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
                        || c.2.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
                })
                .unwrap_or(false),
            account_label: sc.as_ref().and_then(|c| c.2.clone()),
            details: "SoundCloud".to_string(),
            has_credentials: sc
                .as_ref()
                .map(|c| {
                    c.0.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
                        || c.2.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
                })
                .unwrap_or(false),
        },
    ])
}

#[tauri::command]
pub async fn search_source(
    state: State<'_, AppState>,
    source: SourceKind,
    query: String,
) -> Result<Vec<Track>, String> {
    match source {
        SourceKind::Local => state.db.get_tracks(Some(SourceKind::Local), Some(&query)),
        SourceKind::Yandex => {
            let token = state.db.get_credentials(SourceKind::Yandex)?.and_then(|c| c.0);
            yandex::search_tracks(&state.http, token.as_deref(), &query).await
        }
        SourceKind::Spotify => {
            let token = state
                .db
                .get_credentials(SourceKind::Spotify)?
                .and_then(|c| c.0)
                .ok_or_else(|| "Connect Spotify credentials first".to_string())?;
            spotify::search_tracks(&state.http, &token, &query).await
        }
        SourceKind::SoundCloud => {
            let cached = state.db.get_credentials(SourceKind::SoundCloud)?.and_then(|c| c.1);
            let cid = soundcloud::resolve_client_id(&state.http, cached.as_deref()).await?;
            let _ = state
                .db
                .save_credentials(SourceKind::SoundCloud, None, Some(&cid), None, None);
            soundcloud::search_tracks(&state.http, &cid, &query).await
        }
    }
}

#[tauri::command]
pub async fn search_all_sources(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<Track>, String> {
    let mut all = state.db.get_tracks(None, Some(&query)).unwrap_or_default();

    let ym_token = state.db.get_credentials(SourceKind::Yandex)?.and_then(|c| c.0);
    let sp_token = state.db.get_credentials(SourceKind::Spotify)?.and_then(|c| c.0);
    let sc_cached = state.db.get_credentials(SourceKind::SoundCloud)?.and_then(|c| c.1);

    let http_ym = state.http.clone();
    let http_sp = state.http.clone();
    let http_sc = state.http.clone();
    let q_ym = query.clone();
    let q_sp = query.clone();
    let q_sc = query.clone();

    let (ym_res, sp_res, sc_res) = tokio::join!(
        async move {
            yandex::search_tracks(&http_ym, ym_token.as_deref(), &q_ym)
                .await
                .unwrap_or_default()
        },
        async move {
            match sp_token {
                Some(tok) => spotify::search_tracks(&http_sp, &tok, &q_sp)
                    .await
                    .unwrap_or_default(),
                None => Vec::new(),
            }
        },
        async move {
            match soundcloud::resolve_client_id(&http_sc, sc_cached.as_deref()).await {
                Ok(cid) => soundcloud::search_tracks(&http_sc, &cid, &q_sc)
                    .await
                    .unwrap_or_default(),
                Err(_) => Vec::new(),
            }
        }
    );

    all.extend(ym_res);
    all.extend(sp_res);
    all.extend(sc_res);
    Ok(all)
}

fn open_system_browser(url: &str) -> Result<(), String> {
    Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to open browser: {}", e))?;
    Ok(())
}

fn extract_yandex_token(input: &str) -> String {
    let trimmed = input.trim();
    if let Some(pos) = trimmed.find("access_token=") {
        let rest = &trimmed[pos + "access_token=".len()..];
        let end = rest.find('&').unwrap_or(rest.len());
        return rest[..end].to_string();
    }
    trimmed.to_string()
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
pub async fn connect_yandex_token(
    state: State<'_, AppState>,
    token: String,
) -> Result<SourceStatus, String> {
    let clean_token = extract_yandex_token(&token);
    if clean_token.is_empty() {
        return Err("Token is empty".to_string());
    }
    let (_, label) = yandex::fetch_account_status(&state.http, &clean_token).await?;
    state.db.save_credentials(
        SourceKind::Yandex,
        Some(&clean_token),
        None,
        Some(&label),
        None,
    )?;
    Ok(SourceStatus {
        source: SourceKind::Yandex,
        connected: true,
        account_label: Some(label),
        details: "Yandex Music".to_string(),
        has_credentials: true,
    })
}

#[tauri::command]
pub fn open_yandex_login_browser() -> Result<(), String> {
    open_system_browser(
        "https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d",
    )
}

#[tauri::command]
pub async fn sync_yandex_library(state: State<'_, AppState>) -> Result<usize, String> {
    let token = state
        .db
        .get_credentials(SourceKind::Yandex)?
        .and_then(|c| c.0)
        .ok_or_else(|| "Yandex Music not connected".to_string())?;
    let (tracks, playlists) = yandex::sync_library(&state.http, &token).await?;
    let _ = state.db.delete_source_tracks(SourceKind::Yandex);
    let mut total = tracks.len();
    state.db.upsert_tracks(&tracks)?;
    for (pl, pl_tracks) in playlists {
        state.db.upsert_playlist(&pl)?;
        total += pl_tracks.len();
        for t in pl_tracks {
            let _ = state.db.add_track_to_playlist(&pl.id, &t);
        }
    }
    Ok(total)
}

#[tauri::command]
pub async fn connect_spotify_credentials(
    state: State<'_, AppState>,
    client_id: String,
    access_token: Option<String>,
) -> Result<SourceStatus, String> {
    let label = if let Some(tok) = access_token.as_deref() {
        Some(spotify::fetch_me(&state.http, tok).await?)
    } else {
        None
    };
    state.db.save_credentials(
        SourceKind::Spotify,
        access_token.as_deref(),
        if client_id.is_empty() { None } else { Some(&client_id) },
        label.as_deref(),
        None,
    )?;
    Ok(SourceStatus {
        source: SourceKind::Spotify,
        connected: access_token.is_some(),
        account_label: label,
        details: "Spotify".to_string(),
        has_credentials: access_token.is_some(),
    })
}

#[tauri::command]
pub async fn open_spotify_login_browser(app: AppHandle, client_id: String) -> Result<(), String> {
    let cid = client_id.trim().to_string();
    if cid.is_empty() {
        return Err("Provide your Spotify App Client ID first".to_string());
    }
    let (verifier, challenge) = spotify::generate_pkce_pair();
    let mut auth_url =
        Url::parse("https://accounts.spotify.com/authorize").map_err(|e| e.to_string())?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &cid)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", spotify::SPOTIFY_REDIRECT_URI)
        .append_pair(
            "scope",
            "user-library-read playlist-read-private user-read-private",
        )
        .append_pair("code_challenge_method", "S256")
        .append_pair("code_challenge", &challenge);

    let listener = TcpListener::bind("127.0.0.1:43821")
        .await
        .map_err(|e| format!("Local callback port 43821 busy: {}", e))?;

    open_system_browser(auth_url.as_str())?;

    let app_inner = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let mut buf = [0u8; 4096];
            if let Ok(n) = stream.read(&mut buf).await {
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or("");
                let path = first_line.split_whitespace().nth(1).unwrap_or("/");
                let parsed = Url::parse(&format!("http://127.0.0.1:43821{}", path));
                let code = parsed.ok().and_then(|u| {
                    u.query_pairs()
                        .find(|(k, _)| k == "code")
                        .map(|(_, v)| v.to_string())
                });

                let (html, ok, msg) = if let Some(auth_code) = code {
                    let st = app_inner.state::<AppState>();
                    match spotify::exchange_code(&st.http, &cid, &auth_code, &verifier).await {
                        Ok(tok) => {
                            let label = spotify::fetch_me(&st.http, &tok)
                                .await
                                .unwrap_or_else(|_| "Spotify Listener".to_string());
                            let _ = st.db.save_credentials(
                                SourceKind::Spotify,
                                Some(&tok),
                                Some(&cid),
                                Some(&label),
                                None,
                            );
                            (
                                "<html><body style='background:#090B10;color:#EDF2F7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h2>Awase Connected</h2><p style='color:#94A3B8'>You can close this browser tab and return to Awase.</p></div></body></html>".to_string(),
                                true,
                                format!("Connected Spotify as {}", label),
                            )
                        }
                        Err(err) => (
                            format!("<html><body style='background:#090B10;color:#F43F5E;font-family:sans-serif;padding:40px'>Spotify Error: {}</body></html>", err),
                            false,
                            err,
                        ),
                    }
                } else {
                    (
                        "<html><body style='background:#090B10;color:#F43F5E;font-family:sans-serif;padding:40px'>Missing authorization code.</body></html>".to_string(),
                        false,
                        "Spotify authorization was canceled".to_string(),
                    )
                };

                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = app_inner.emit(
                    "awase://oauth-complete",
                    OAuthEventPayload {
                        source: "spotify".to_string(),
                        ok,
                        message: msg,
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn open_spotify_web_login(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let login_url = Url::parse("https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F")
        .map_err(|e| e.to_string())?;
    let hook_js = r#"
(function(){
  if (window.__awaseSpLoginHook) return;
  window.__awaseSpLoginHook = true;
  var sent = false;
  function trySend(auth, ct) {
    if (sent || !auth) return;
    if (location.hostname !== 'open.spotify.com') return;
    var m = String(auth).match(/^Bearer\s+(.+)$/i);
    if (!m) return;
    sent = true;
    var u = 'https://awase.local.done/?token=' + encodeURIComponent(m[1]) + (ct ? '&ct=' + encodeURIComponent(ct) : '');
    try { window.location.replace(u); } catch(e) {}
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      try {
        var hdrs = (init && init.headers) || (input && input.headers);
        var auth = '';
        var ct = '';
        if (hdrs && typeof hdrs.get === 'function') {
          auth = hdrs.get('authorization') || hdrs.get('Authorization') || '';
          ct = hdrs.get('client-token') || '';
        } else if (hdrs && typeof hdrs === 'object') {
          auth = hdrs.authorization || hdrs.Authorization || '';
          ct = hdrs['client-token'] || '';
        }
        trySend(auth, ct);
      } catch(e) {}
      return origFetch.apply(this, arguments);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  var origSetHdr = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function() {
    this.__awHdrs = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
    if (this.__awHdrs) this.__awHdrs[String(k).toLowerCase()] = v;
    if (String(k).toLowerCase() === 'authorization') {
      trySend(v, this.__awHdrs ? this.__awHdrs['client-token'] : '');
    }
    return origSetHdr.apply(this, arguments);
  };
})();
"#;

    if let Some(existing) = app.get_webview_window("sp_web_login") {
        let _ = existing.close();
    }

    let app_cb = app.clone();
    let db = Arc::clone(&state.db);
    let http = state.http.clone();

    tauri::WebviewWindowBuilder::new(
        &app,
        "sp_web_login",
        tauri::WebviewUrl::External(login_url),
    )
    .title("Awase — Spotify Login")
    .inner_size(940.0, 720.0)
    .center()
    .initialization_script(hook_js)
    .on_navigation(move |nav_url| {
        if nav_url.host_str() == Some("awase.local.done") {
            let mut tok: Option<String> = None;
            let mut ct: Option<String> = None;
            for (k, v) in nav_url.query_pairs() {
                if k == "token" && !v.is_empty() {
                    tok = Some(v.into_owned());
                } else if k == "ct" && !v.is_empty() {
                    ct = Some(v.into_owned());
                }
            }
            if let Some(token) = tok {
                let app_emit = app_cb.clone();
                let db_inner = Arc::clone(&db);
                let http_inner = http.clone();
                tauri::async_runtime::spawn(async move {
                    let label = spotify::fetch_me(&http_inner, &token)
                        .await
                        .unwrap_or_else(|_| "Spotify Account".to_string());
                    let _ = db_inner.save_credentials(
                        SourceKind::Spotify,
                        Some(&token),
                        None,
                        Some(&label),
                        ct.as_deref(),
                    );
                    let (tracks, playlists) =
                        spotify::sync_library(&http_inner, &token, ct.as_deref())
                            .await
                            .unwrap_or_default();
                    let mut count = tracks.len();
                    let _ = db_inner.upsert_tracks(&tracks);
                    for pl in playlists {
                        let _ = db_inner.upsert_playlist(&pl);
                        if let Some(pid) = pl.id.strip_prefix("spotify_pl_") {
                            if let Some((_, pl_tracks)) = spotify::import_public_playlist_via_api(
                                &http_inner,
                                pid,
                                &token,
                                ct.as_deref(),
                            )
                            .await
                            {
                                count += pl_tracks.len();
                                for t in &pl_tracks {
                                    let _ = db_inner.add_track_to_playlist(&pl.id, t);
                                }
                            }
                        }
                    }
                    let _ = app_emit.emit(
                        "awase://oauth-complete",
                        OAuthEventPayload {
                            source: "spotify".to_string(),
                            ok: true,
                            message: format!("Spotify: {} ({} tracks)", label, count),
                        },
                    );
                });
            }
            if let Some(w) = app_cb.get_webview_window("sp_web_login") {
                let _ = w.close();
            }
            return false;
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn sync_spotify_library(state: State<'_, AppState>) -> Result<usize, String> {
    let creds = state
        .db
        .get_credentials(SourceKind::Spotify)?
        .ok_or_else(|| "Spotify not connected".to_string())?;
    let token = creds
        .0
        .ok_or_else(|| "Spotify not connected".to_string())?;
    let ct = creds.3;
    let (tracks, playlists) =
        spotify::sync_library(&state.http, &token, ct.as_deref()).await?;
    let mut count = tracks.len();
    state.db.upsert_tracks(&tracks)?;
    for pl in playlists {
        state.db.upsert_playlist(&pl)?;
        if let Some(pid) = pl.id.strip_prefix("spotify_pl_") {
            if let Some((_, pl_tracks)) =
                spotify::import_public_playlist_via_api(&state.http, pid, &token, ct.as_deref())
                    .await
            {
                count += pl_tracks.len();
                for t in &pl_tracks {
                    let _ = state.db.add_track_to_playlist(&pl.id, t);
                }
            }
        }
    }
    Ok(count)
}

async fn probe_spotify_web_token(
    app: &AppHandle,
    pid: &str,
) -> Option<(String, Option<String>)> {
    let target_url =
        Url::parse(&format!("https://open.spotify.com/playlist/{}", pid)).ok()?;
    let (tx, rx) = tokio::sync::oneshot::channel::<(String, Option<String>)>();
    let tx_cell = Arc::new(parking_lot::Mutex::new(Some(tx)));

    let hook_js = r#"
(function(){
  if (window.__awaseSpHooked) return;
  window.__awaseSpHooked = true;
  var sent = false;
  function trySend(auth, ct) {
    if (sent || !auth) return;
    var m = String(auth).match(/^Bearer\s+(.+)$/i);
    if (!m) return;
    sent = true;
    var u = 'https://awase.local.done/?token=' + encodeURIComponent(m[1]) + (ct ? '&ct=' + encodeURIComponent(ct) : '');
    try { window.location.replace(u); } catch(e) {}
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      try {
        var hdrs = (init && init.headers) || (input && input.headers);
        var auth = '';
        var ct = '';
        if (hdrs && typeof hdrs.get === 'function') {
          auth = hdrs.get('authorization') || hdrs.get('Authorization') || '';
          ct = hdrs.get('client-token') || '';
        } else if (hdrs && typeof hdrs === 'object') {
          auth = hdrs.authorization || hdrs.Authorization || '';
          ct = hdrs['client-token'] || '';
        }
        trySend(auth, ct);
      } catch(e) {}
      return origFetch.apply(this, arguments);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  var origSetHdr = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function() {
    this.__awHdrs = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
    if (this.__awHdrs) this.__awHdrs[String(k).toLowerCase()] = v;
    if (String(k).toLowerCase() === 'authorization') {
      trySend(v, this.__awHdrs ? this.__awHdrs['client-token'] : '');
    }
    return origSetHdr.apply(this, arguments);
  };
  setInterval(function(){
    try { window.scrollBy(0, 600); } catch(e) {}
  }, 900);
})();
"#;

    let label = format!(
        "sp_probe_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let label_close = label.clone();
    let app_close = app.clone();
    let tx_nav = Arc::clone(&tx_cell);

    let win = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(target_url))
        .visible(false)
        .initialization_script(hook_js)
        .on_navigation(move |nav_url| {
            if nav_url.host_str() == Some("awase.local.done") {
                let mut tok: Option<String> = None;
                let mut ct: Option<String> = None;
                for (k, v) in nav_url.query_pairs() {
                    if k == "token" && !v.is_empty() {
                        tok = Some(v.into_owned());
                    } else if k == "ct" && !v.is_empty() {
                        ct = Some(v.into_owned());
                    }
                }
                if let Some(t) = tok {
                    if let Some(sender) = tx_nav.lock().take() {
                        let _ = sender.send((t, ct));
                    }
                }
                if let Some(w) = app_close.get_webview_window(&label_close) {
                    let _ = w.close();
                }
                return false;
            }
            true
        })
        .build()
        .ok()?;

    let res = tokio::time::timeout(std::time::Duration::from_secs(10), rx)
        .await
        .ok()
        .and_then(|r| r.ok());
    let _ = win.close();
    res
}

#[tauri::command]
pub async fn import_spotify_playlist_url(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<usize, String> {
    let user_tok = state
        .db
        .get_credentials(SourceKind::Spotify)?
        .and_then(|c| c.0);

    let mut imported: Option<(Playlist, Vec<Track>)> = None;
    if let Some(pid) = spotify::extract_spotify_playlist_id(&url) {
        if let Some(ref tok) = user_tok.as_deref().filter(|t| !t.trim().is_empty()) {
            imported =
                spotify::import_public_playlist_via_api(&state.http, &pid, tok, None).await;
        }
        if imported.is_none() {
            if let Some((live_tok, ct)) = probe_spotify_web_token(&app, &pid).await {
                imported = spotify::import_public_playlist_via_api(
                    &state.http,
                    &pid,
                    &live_tok,
                    ct.as_deref(),
                )
                .await;
            }
        }
    }

    let (pl, tracks) = match imported {
        Some(pair) => pair,
        None => spotify::import_public_playlist(&state.http, &url, user_tok.as_deref()).await?,
    };
    let count = tracks.len();
    state.db.upsert_playlist(&pl)?;
    for t in &tracks {
        let _ = state.db.add_track_to_playlist(&pl.id, t);
    }
    let _ = state.db.save_credentials(
        SourceKind::Spotify,
        None,
        None,
        Some("Public Playlist"),
        None,
    );
    Ok(count)
}

#[tauri::command]
pub fn import_spotify_file(state: State<'_, AppState>, file_path: String) -> Result<usize, String> {
    let (tracks, playlists) = spotify::import_from_file(&file_path)?;
    let mut total = tracks.len();
    if !tracks.is_empty() {
        state.db.upsert_tracks(&tracks)?;
    }
    for (pl, pl_tracks) in playlists {
        total += pl_tracks.len();
        state.db.upsert_playlist(&pl)?;
        for t in pl_tracks {
            let _ = state.db.add_track_to_playlist(&pl.id, &t);
        }
    }
    let _ = state.db.save_credentials(
        SourceKind::Spotify,
        None,
        None,
        Some("Imported Library"),
        None,
    );
    Ok(total)
}

#[tauri::command]
pub async fn connect_soundcloud_token(
    state: State<'_, AppState>,
    token: String,
    profile_handle: Option<String>,
) -> Result<SourceStatus, String> {
    let tok_opt = if token.trim().is_empty() { None } else { Some(token.trim()) };
    let clean_handle = profile_handle
        .as_deref()
        .map(|h| h.trim().trim_start_matches("https://soundcloud.com/").trim_matches('/').to_string())
        .filter(|h| !h.is_empty());
    state.db.save_credentials(
        SourceKind::SoundCloud,
        tok_opt,
        None,
        clean_handle.as_deref(),
        clean_handle.as_deref(),
    )?;
    Ok(SourceStatus {
        source: SourceKind::SoundCloud,
        connected: true,
        account_label: clean_handle,
        details: "SoundCloud".to_string(),
        has_credentials: true,
    })
}

#[tauri::command]
pub async fn sync_soundcloud_library(state: State<'_, AppState>) -> Result<usize, String> {
    let creds = state.db.get_credentials(SourceKind::SoundCloud)?;
    let token = creds.as_ref().and_then(|c| c.0.as_deref());
    let cached_cid = creds.as_ref().and_then(|c| c.1.as_deref());
    let handle = creds.as_ref().and_then(|c| c.2.as_deref());
    let cid = soundcloud::resolve_client_id(&state.http, cached_cid).await?;
    let _ = state
        .db
        .save_credentials(SourceKind::SoundCloud, None, Some(&cid), None, None);
    let tracks = soundcloud::sync_likes(&state.http, &cid, handle, token).await?;
    let count = tracks.len();
    state.db.upsert_tracks(&tracks)?;
    Ok(count)
}

#[tauri::command]
pub fn disconnect_source(state: State<'_, AppState>, source: SourceKind) -> Result<(), String> {
    state.db.clear_credentials(source)
}

#[tauri::command]
pub fn get_process_memory_mb(state: State<'_, AppState>) -> f64 {
    let pid = Pid::from_u32(std::process::id());
    let mut sys = state.sys.lock();
    sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    sys.process(pid)
        .map(|p| p.memory() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0)
}

#[tauri::command]
pub fn set_gaming_mode(_enabled: bool) {
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_system_browser(&url)
}

#[tauri::command]
pub fn update_discord_presence(payload: crate::discord_rpc::DiscordPresencePayload) {
    crate::discord_rpc::enqueue_presence(payload);
}

#[derive(serde::Serialize, serde::Deserialize)]
struct UserBackup {
    ui_prefs: Option<String>,
    volume: Option<String>,
    muted: Option<String>,
    audio_device: Option<String>,
    #[serde(default)]
    sc_ru_bypass_mode: Option<String>,
    #[serde(default)]
    sc_ru_tripped: Option<String>,
    equalizer: EqualizerState,
    local_folders: Vec<String>,
    credentials: Vec<(String, Option<String>, Option<String>, Option<String>, Option<String>)>,
    #[serde(default)]
    tracks: Vec<Track>,
    playlists: Vec<(Playlist, Vec<Track>)>,
}

#[tauri::command]
pub fn export_user_backup(state: State<'_, AppState>, file_path: String) -> Result<(), String> {
    let ui_prefs = state.db.get_setting("ui_prefs")?;
    let volume = state.db.get_setting("volume")?;
    let muted = state.db.get_setting("muted")?;
    let audio_device = state.db.get_setting("audio_device")?;
    let sc_ru_bypass_mode = state.db.get_setting("sc_ru_bypass_mode")?;
    let sc_ru_tripped = state.db.get_setting("sc_ru_tripped")?;
    let equalizer = state.db.get_equalizer()?;
    let local_folders = state
        .db
        .get_local_folders()?
        .into_iter()
        .map(|f| f.path)
        .collect();

    let mut credentials = Vec::new();
    for src in [SourceKind::Yandex, SourceKind::Spotify, SourceKind::SoundCloud] {
        if let Some((tok, cid, label, extra)) = state.db.get_credentials(src)? {
            credentials.push((src.as_str().to_string(), tok, cid, label, extra));
        }
    }

    let tracks = state.db.get_all_tracks_raw()?;

    let mut playlists = Vec::new();
    for pl in state.db.get_playlists()? {
        let pl_tracks = state.db.get_playlist_tracks(&pl.id)?;
        playlists.push((pl, pl_tracks));
    }

    let backup = UserBackup {
        ui_prefs,
        volume,
        muted,
        audio_device,
        sc_ru_bypass_mode,
        sc_ru_tripped,
        equalizer,
        local_folders,
        credentials,
        tracks,
        playlists,
    };

    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    std::fs::write(&file_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_user_backup(
    state: State<'_, AppState>,
    file_path: String,
) -> Result<Option<String>, String> {
    let raw = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let backup: UserBackup = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    if let Some(ref prefs) = backup.ui_prefs {
        state.db.save_setting("ui_prefs", prefs)?;
    }
    if let Some(ref vol) = backup.volume {
        state.db.save_setting("volume", vol)?;
        if let Ok(v) = vol.parse::<f32>() {
            state.engine.set_volume(v);
        }
    }
    if let Some(ref mut_str) = backup.muted {
        state.db.save_setting("muted", mut_str)?;
        state.engine.set_muted(mut_str == "true");
    }
    if let Some(ref dev) = backup.audio_device {
        state.db.save_setting("audio_device", dev)?;
        let _ = state.engine.set_output_device(dev);
    }
    if let Some(ref mode_str) = backup.sc_ru_bypass_mode {
        state.db.save_setting("sc_ru_bypass_mode", mode_str)?;
        if let Ok(m) = mode_str.parse::<u8>() {
            soundcloud::set_ru_bypass_mode(m);
        }
    }
    if let Some(ref tripped_str) = backup.sc_ru_tripped {
        state.db.save_setting("sc_ru_tripped", tripped_str)?;
        soundcloud::set_ru_tripped(tripped_str == "true");
    }

    state.db.save_equalizer(&backup.equalizer)?;
    state.engine.update_equalizer(backup.equalizer);

    for (src_str, tok, cid, label, extra) in backup.credentials {
        let src = SourceKind::from_str(&src_str);
        state.db.save_credentials(
            src,
            tok.as_deref(),
            cid.as_deref(),
            label.as_deref(),
            extra.as_deref(),
        )?;
    }

    if !backup.tracks.is_empty() || !backup.playlists.is_empty() {
        let _ = state.db.clear_library();
    }

    if !backup.tracks.is_empty() {
        state.db.upsert_tracks(&backup.tracks)?;
    }

    for folder in backup.local_folders {
        let _ = state.db.upsert_local_folder(&LocalFolder {
            path: folder,
            track_count: 0,
            last_scanned: 0,
        });
    }

    for (pl, pl_tracks) in backup.playlists {
        state.db.upsert_playlist(&pl)?;
        for t in pl_tracks {
            let _ = state.db.add_track_to_playlist(&pl.id, &t);
        }
    }

    Ok(backup.ui_prefs)
}

#[tauri::command]
pub async fn get_wave_tracks(
    state: State<'_, AppState>,
    source: String,
    reset: Option<bool>,
) -> Result<Vec<Track>, String> {
    let saved_last_id = state.db.get_setting("wave_last_track_id_v1").ok().flatten();
    if let Ok(Some(saved_seen)) = state.db.get_setting("wave_seen_v1") {
        if let Ok(ids) = serde_json::from_str::<Vec<String>>(&saved_seen) {
            yandex::load_wave_seen(ids.clone(), saved_last_id);
            soundcloud::load_wave_seen(ids);
        }
    } else if saved_last_id.is_some() {
        yandex::load_wave_seen(Vec::new(), saved_last_id);
    }

    let want_ym = source == "yandex" || source == "mix";
    let want_sc = source == "soundcloud" || source == "mix";

    let mut ym_tracks = Vec::new();
    let mut sc_tracks = Vec::new();

    if want_ym {
        let token = state.db.get_credentials(SourceKind::Yandex)?.and_then(|c| c.0);
        if let Some(tok) = token {
            let seeds: Vec<String> = state
                .db
                .get_tracks(Some(SourceKind::Yandex), None)
                .unwrap_or_default()
                .into_iter()
                .take(60)
                .map(|t| t.external_id)
                .collect();
            ym_tracks = yandex::fetch_my_wave(&state.http, &tok, reset.unwrap_or(false), &seeds)
                .await
                .unwrap_or_default();
        } else if source == "yandex" {
            return Err("Connect Yandex Music first".to_string());
        }
    }

    if want_sc {
        let cached = state.db.get_credentials(SourceKind::SoundCloud)?.and_then(|c| c.1);
        let cid = soundcloud::resolve_client_id(&state.http, cached.as_deref()).await?;
        let _ = state
            .db
            .save_credentials(SourceKind::SoundCloud, None, Some(&cid), None, None);
        let seeds: Vec<String> = state
            .db
            .get_tracks(Some(SourceKind::SoundCloud), None)
            .unwrap_or_default()
            .into_iter()
            .filter(|t| t.liked)
            .take(40)
            .map(|t| t.external_id)
            .collect();
        sc_tracks = soundcloud::fetch_my_wave(&state.http, &cid, &seeds)
            .await
            .unwrap_or_default();
    }

    if source == "mix" {
        let mut mixed = Vec::with_capacity(ym_tracks.len() + sc_tracks.len());
        let max_len = ym_tracks.len().max(sc_tracks.len());
        for i in 0..max_len {
            if let Some(t) = ym_tracks.get(i) {
                mixed.push(t.clone());
            }
            if let Some(t) = sc_tracks.get(i) {
                mixed.push(t.clone());
            }
        }
        let (mut combined, last_ym) = yandex::dump_wave_seen();
        combined.extend(soundcloud::dump_wave_seen());
        if let Ok(json_s) = serde_json::to_string(&combined) {
            let _ = state.db.save_setting("wave_seen_v1", &json_s);
        }
        if let Some(lid) = last_ym {
            let _ = state.db.save_setting("wave_last_track_id_v1", &lid);
        }
        return Ok(mixed);
    }

    let (mut combined, last_ym) = yandex::dump_wave_seen();
    combined.extend(soundcloud::dump_wave_seen());
    if let Ok(json_s) = serde_json::to_string(&combined) {
        let _ = state.db.save_setting("wave_seen_v1", &json_s);
    }
    if let Some(lid) = last_ym {
        let _ = state.db.save_setting("wave_last_track_id_v1", &lid);
    }

    if want_ym {
        Ok(ym_tracks)
    } else {
        Ok(sc_tracks)
    }
}

#[tauri::command]
pub async fn prefetch_track(state: State<'_, AppState>, track: Track) -> Result<(), String> {
    match track.source {
        SourceKind::SoundCloud => {
            let creds = state.db.get_credentials(SourceKind::SoundCloud)?;
            let cached_cid = creds.as_ref().and_then(|c| c.1.as_deref());
            let cid = soundcloud::resolve_client_id(&state.http, cached_cid).await?;
            let _ = soundcloud::resolve_and_download(
                &state.http,
                &state.cache_dir,
                &cid,
                &track.external_id,
                &track.id,
            )
            .await?;
        }
        SourceKind::Yandex => {
            let token = state
                .db
                .get_credentials(SourceKind::Yandex)?
                .and_then(|c| c.0)
                .ok_or_else(|| "Not connected".to_string())?;
            let (stream_url, _, ext) =
                yandex::resolve_stream_url(&state.http, &token, &track.external_id).await?;
            let _ = providers::download_to_cache(
                &state.http,
                &state.cache_dir,
                &track.id,
                &ext,
                &stream_url,
                None,
            )
            .await?;
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub async fn fetch_cover_cached(
    state: State<'_, AppState>,
    url: String,
) -> Result<String, String> {
    use base64::Engine as _;
    use sha2::{Digest, Sha256};

    let covers_dir = state.cache_dir.join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let key = format!("{:x}", hasher.finalize());
    let file_path = covers_dir.join(format!("{}.img", key));

    let bytes = if file_path.exists() {
        std::fs::read(&file_path).map_err(|e| e.to_string())?
    } else {
        let fetched = soundcloud::fetch_stream_bytes(&state.http, &url).await?;
        if fetched.len() < 128 {
            return Err("Empty cover image".to_string());
        }
        let _ = std::fs::write(&file_path, &fetched);
        fetched
    };

    let mime = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(b"RIFF") {
        "image/webp"
    } else {
        "image/jpeg"
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub async fn get_track_lyrics(
    state: State<'_, AppState>,
    track: Track,
) -> Result<LyricsPayload, String> {
    let ym_token = state.db.get_credentials(SourceKind::Yandex)?.and_then(|c| c.0);
    lyrics::get_lyrics(
        &state.http,
        &state.cache_dir,
        &track.id,
        &track.external_id,
        track.source.as_str(),
        &track.artist,
        &track.title,
        track.duration_ms,
        ym_token.as_deref(),
    )
    .await
}

#[tauri::command]
pub fn get_ru_bypass_status() -> (u8, bool) {
    soundcloud::get_ru_bypass_state()
}

#[tauri::command]
pub fn set_ru_bypass_mode(state: State<'_, AppState>, mode: u8) -> (u8, bool) {
    soundcloud::set_ru_bypass_mode(mode);
    let _ = state.db.save_setting("sc_ru_bypass_mode", &mode.to_string());
    if mode == 2 {
        let _ = state.db.save_setting("sc_ru_tripped", "false");
    }
    soundcloud::get_ru_bypass_state()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub total_bytes: u64,
    pub file_count: usize,
}

fn dir_stats(dir: &std::path::Path) -> (u64, usize) {
    let mut bytes = 0u64;
    let mut count = 0usize;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let (b, c) = dir_stats(&p);
                bytes += b;
                count += c;
            } else if let Ok(meta) = entry.metadata() {
                bytes += meta.len();
                count += 1;
            }
        }
    }
    (bytes, count)
}

#[tauri::command]
pub fn get_cache_stats(state: State<'_, AppState>) -> CacheStats {
    let (total_bytes, file_count) = dir_stats(&state.cache_dir);
    CacheStats {
        total_bytes,
        file_count,
    }
}

fn clear_dir_files(dir: &std::path::Path) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                clear_dir_files(&p);
            } else {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
}

#[tauri::command]
pub fn clear_cache(state: State<'_, AppState>) -> CacheStats {
    clear_dir_files(&state.cache_dir);
    let (total_bytes, file_count) = dir_stats(&state.cache_dir);
    CacheStats {
        total_bytes,
        file_count,
    }
}

#[tauri::command]
pub fn cleanup_non_favorite_cache(state: State<'_, AppState>, max_age_days: i64) -> CacheStats {
    if max_age_days >= 0 {
        let liked = state.db.get_liked_track_ids().unwrap_or_default();
        let playing_id = state.engine.get_telemetry().current_track_id;
        let max_age = std::time::Duration::from_secs((max_age_days as u64).saturating_mul(86400));
        let now = std::time::SystemTime::now();
        if let Ok(rd) = std::fs::read_dir(&state.cache_dir) {
            for entry in rd.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    continue;
                }
                let stem = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                if stem.is_empty() || liked.contains(&stem) {
                    continue;
                }
                if playing_id.as_deref() == Some(stem.as_str()) {
                    continue;
                }
                if max_age_days == 0 {
                    let _ = std::fs::remove_file(&p);
                } else if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if let Ok(elapsed) = now.duration_since(modified) {
                            if elapsed >= max_age {
                                let _ = std::fs::remove_file(&p);
                            }
                        }
                    }
                }
            }
        }
    }
    let (total_bytes, file_count) = dir_stats(&state.cache_dir);
    CacheStats {
        total_bytes,
        file_count,
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub release_name: String,
}

fn parse_ver_tuple(v: &str) -> (u64, u64, u64) {
    let clean = v.trim().trim_start_matches('v').trim_start_matches('V');
    let mut parts = clean.split('.').map(|p| p.parse::<u64>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

#[tauri::command]
pub fn record_listen_event(
    state: State<'_, AppState>,
    track: Track,
    listened_ms: u64,
) -> Result<(), String> {
    state.db.record_listen_event(&track, listened_ms)
}

#[tauri::command]
pub fn get_wrapped_stats(state: State<'_, AppState>) -> Result<crate::db::WrappedStatsData, String> {
    state.db.get_wrapped_stats()
}

#[tauri::command]
pub async fn check_for_updates(state: State<'_, AppState>) -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let resp = state
        .http
        .get("https://api.github.com/repos/Mono-no-Awares/Awase/releases/latest")
        .header("User-Agent", "Awase/0.1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API HTTP {}", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let latest_version = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or(&current_version)
        .to_string();
    let release_url = json
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://github.com/Mono-no-Awares/Awase/releases")
        .to_string();
    let release_name = json
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&latest_version)
        .to_string();
    let has_update = parse_ver_tuple(&latest_version) > parse_ver_tuple(&current_version);
    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        has_update,
        release_url,
        release_name,
    })
}
