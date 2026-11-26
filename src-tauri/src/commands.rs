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
pub fn clear_library(state: State<'_, AppState>) -> Result<(), String> {
    state.engine.stop();
    state.db.clear_library()
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
pub fn toggle_track_like(state: State<'_, AppState>, track_id: String) -> Result<bool, String> {
    state.db.toggle_like(&track_id)
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
pub async fn play_track(state: State<'_, AppState>, track: Track) -> Result<(), String> {
    let seq = state.play_seq.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = state.db.upsert_tracks(std::slice::from_ref(&track));
    let codec_label = track.codec.clone().unwrap_or_else(|| "AUDIO".to_string());
    let bitrate = track.bitrate_kbps.unwrap_or(0);

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
            let (stream_url, _, ext) =
                yandex::resolve_stream_url(&state.http, &token, &track.external_id).await?;
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
            soundcloud::resolve_and_download(
                &state.http,
                &state.cache_dir,
                &cid,
                &track.external_id,
                &track.id,
            )
            .await?
        }
        SourceKind::Spotify => {
            let title_lc = track.title.to_lowercase();
            let artist_lc = track.artist.to_lowercase();
            let first_artist = artist_lc.split(',').next().unwrap_or("").trim().to_string();

            let local_match = state
                .db
                .get_tracks(None, Some(&track.title))
                .ok()
                .and_then(|candidates| {
                    candidates.into_iter().find(|c| {
                        c.source != SourceKind::Spotify
                            && c.title.to_lowercase().contains(&title_lc)
                            && (first_artist.is_empty()
                                || c.artist.to_lowercase().contains(&first_artist))
                    })
                });

            if let Some(matched) = local_match {
                match matched.source {
                    SourceKind::Local => {
                        if let Some(p) = matched.local_path {
                            PathBuf::from(p)
                        } else {
                            return Err("Missing local file path".to_string());
                        }
                    }
                    SourceKind::Yandex => {
                        let token = state
                            .db
                            .get_credentials(SourceKind::Yandex)?
                            .and_then(|c| c.0)
                            .ok_or_else(|| "Connect Yandex Music first".to_string())?;
                        let (stream_url, _, ext) =
                            yandex::resolve_stream_url(&state.http, &token, &matched.external_id)
                                .await?;
                        providers::download_to_cache(
                            &state.http,
                            &state.cache_dir,
                            &matched.id,
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
                        soundcloud::resolve_and_download(
                            &state.http,
                            &state.cache_dir,
                            &cid,
                            &matched.external_id,
                            &matched.id,
                        )
                        .await?
                    }
                    SourceKind::Spotify => unreachable!(),
                }
            } else {
                let mut resolved_path: Option<PathBuf> = None;

                if let Ok(Some((Some(ytok), _, _, _))) = state.db.get_credentials(SourceKind::Yandex) {
                    let y_query = format!("{} {}", track.artist, track.title);
                    if let Ok(y_tracks) = yandex::search_tracks(&state.http, Some(ytok.as_str()), &y_query).await {
                        if let Some(best_y) = y_tracks.into_iter().find(|y| {
                            y.title.to_lowercase().contains(&title_lc)
                                || (!first_artist.is_empty()
                                    && y.artist.to_lowercase().contains(&first_artist))
                        }) {
                            if let Ok((stream_url, _, ext)) =
                                yandex::resolve_stream_url(&state.http, &ytok, &best_y.external_id)
                                    .await
                            {
                                if let Ok(p) = providers::download_to_cache(
                                    &state.http,
                                    &state.cache_dir,
                                    &best_y.id,
                                    &ext,
                                    &stream_url,
                                    None,
                                )
                                .await
                                {
                                    resolved_path = Some(p);
                                }
                            }
                        }
                    }
                }

                if resolved_path.is_none() {
                    let cached_cid = state
                        .db
                        .get_credentials(SourceKind::SoundCloud)
                        .ok()
                        .flatten()
                        .and_then(|c| c.1);
                    if let Ok(cid) =
                        soundcloud::resolve_client_id(&state.http, cached_cid.as_deref()).await
                    {
                        let query = format!("{} {}", track.artist, track.title);
                        let mut sc_candidates = soundcloud::search_tracks(&state.http, &cid, &query)
                            .await
                            .unwrap_or_default();
                        if sc_candidates.is_empty() {
                            sc_candidates =
                                soundcloud::search_tracks(&state.http, &cid, &track.title)
                                    .await
                                    .unwrap_or_default();
                        }
                        for candidate in sc_candidates
                            .into_iter()
                            .filter(|s| {
                                s.title.to_lowercase().contains(&title_lc)
                                    || (!first_artist.is_empty()
                                        && s.artist.to_lowercase().contains(&first_artist))
                            })
                            .take(4)
                        {
                            if let Ok(p) = soundcloud::resolve_and_download(
                                &state.http,
                                &state.cache_dir,
                                &cid,
                                &candidate.external_id,
                                &candidate.id,
                            )
                            .await
                            {
                                resolved_path = Some(p);
                                break;
                            }
                        }
                    }
                }

                if let Some(p) = resolved_path {
                    p
                } else {
                    let preview = track
                        .stream_url
                        .as_ref()
                        .ok_or_else(|| "No full match found and track has no Spotify preview".to_string())?;
                    providers::download_to_cache(
                        &state.http,
                        &state.cache_dir,
                        &track.id,
                        "mp3",
                        preview,
                        None,
                    )
                    .await?
                }
            }
        }
    };

    if state.play_seq.load(Ordering::SeqCst) != seq {
        return Ok(());
    }

    let play_res = state
        .engine
        .play_file(&track.id, file_path, track.duration_ms, &codec_label, bitrate);

    if play_res.is_err() && track.source == SourceKind::Spotify {
        if let Some(ref preview) = track.stream_url {
            if let Ok(preview_path) = providers::download_to_cache(
                &state.http,
                &state.cache_dir,
                &track.id,
                "mp3",
                preview,
                None,
            )
            .await
            {
                if state.play_seq.load(Ordering::SeqCst) != seq {
                    return Ok(());
                }
                return state.engine.play_file(
                    &track.id,
                    preview_path,
                    track.duration_ms,
                    &codec_label,
                    bitrate,
                );
            }
        }
    }

    play_res
}

#[tauri::command]
pub fn pause_playback(state: State<'_, AppState>) {
    state.engine.pause();
}

#[tauri::command]
pub fn resume_playback(state: State<'_, AppState>) {
    state.engine.resume();
}

#[tauri::command]
pub fn stop_playback(state: State<'_, AppState>) {
    state.engine.stop();
}

#[tauri::command]
pub fn seek_playback(state: State<'_, AppState>, position_ms: u64) -> Result<(), String> {
    state.engine.seek(position_ms)
}

#[tauri::command]
pub fn set_volume(state: State<'_, AppState>, volume: f32) {
    state.engine.set_volume(volume);
    let _ = state.db.save_setting("volume", &volume.clamp(0.0, 1.0).to_string());
    let _ = state.db.save_setting("muted", "false");
}

#[tauri::command]
pub fn set_muted(state: State<'_, AppState>, muted: bool) {
    state.engine.set_muted(muted);
    let _ = state
        .db
        .save_setting("muted", if muted { "true" } else { "false" });
}

#[tauri::command]
pub fn get_telemetry(state: State<'_, AppState>) -> AudioTelemetry {
    state.engine.get_telemetry()
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
            connected: true,
            account_label: sc.as_ref().and_then(|c| c.2.clone()),
            details: "SoundCloud".to_string(),
            has_credentials: sc.is_some(),
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
pub async fn sync_spotify_library(state: State<'_, AppState>) -> Result<usize, String> {
    let token = state
        .db
        .get_credentials(SourceKind::Spotify)?
        .and_then(|c| c.0)
        .ok_or_else(|| "Spotify not connected".to_string())?;
    let (tracks, playlists) = spotify::sync_library(&state.http, &token).await?;
    let count = tracks.len();
    state.db.upsert_tracks(&tracks)?;
    for pl in playlists {
        state.db.upsert_playlist(&pl)?;
    }
    Ok(count)
}

#[tauri::command]
pub async fn import_spotify_playlist_url(
    state: State<'_, AppState>,
    url: String,
) -> Result<usize, String> {
    let (pl, tracks) = spotify::import_public_playlist(&state.http, &url).await?;
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

#[cfg(windows)]
extern "system" {
    fn GetCurrentProcess() -> isize;
    fn SetProcessWorkingSetSize(h_process: isize, min_size: usize, max_size: usize) -> i32;
}

#[tauri::command]
pub fn set_gaming_mode(enabled: bool) {
    if enabled {
        #[cfg(windows)]
        unsafe {
            SetProcessWorkingSetSize(GetCurrentProcess(), usize::MAX, usize::MAX);
        }
    }
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_system_browser(&url)
}

#[tauri::command]
pub fn update_discord_presence(
    enabled: bool,
    app_id: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    cover_url: Option<String>,
    is_playing: bool,
    position_ms: u64,
    duration_ms: u64,
    source: String,
) {
    std::thread::spawn(move || {
        crate::discord_rpc::update_presence(
            enabled,
            &app_id,
            title.as_deref(),
            artist.as_deref(),
            album.as_deref(),
            cover_url.as_deref(),
            is_playing,
            position_ms,
            duration_ms,
            &source,
        );
    });
}

#[derive(serde::Serialize, serde::Deserialize)]
struct UserBackup {
    ui_prefs: Option<String>,
    volume: Option<String>,
    muted: Option<String>,
    audio_device: Option<String>,
    equalizer: EqualizerState,
    local_folders: Vec<String>,
    credentials: Vec<(String, Option<String>, Option<String>, Option<String>, Option<String>)>,
    playlists: Vec<(Playlist, Vec<Track>)>,
}

#[tauri::command]
pub fn export_user_backup(state: State<'_, AppState>, file_path: String) -> Result<(), String> {
    let ui_prefs = state.db.get_setting("ui_prefs")?;
    let volume = state.db.get_setting("volume")?;
    let muted = state.db.get_setting("muted")?;
    let audio_device = state.db.get_setting("audio_device")?;
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
        equalizer,
        local_folders,
        credentials,
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
