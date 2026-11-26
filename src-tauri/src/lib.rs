mod audio_engine;
mod commands;
mod db;
mod discord_rpc;
mod local_scanner;
mod models;
mod providers;

use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use parking_lot::Mutex;
use sysinfo::System;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalSize, Manager, Size, WindowEvent};

use crate::audio_engine::AudioEngine;
use crate::commands::AppState;
use crate::db::Database;

#[cfg(windows)]
extern "system" {
    fn GetWindowLongPtrW(hwnd: isize, n_index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: isize, n_index: i32, new_long: isize) -> isize;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("awase"));
            let db_path = data_dir.join("awase.db");
            let cache_dir = data_dir.join("cache");
            let db = Arc::new(Database::open(db_path).expect("failed to initialize awase db"));
            let initial_eq = db.get_equalizer().unwrap_or_default();
            let initial_vol = db
                .get_setting("volume")
                .ok()
                .flatten()
                .and_then(|s| s.parse::<f32>().ok())
                .unwrap_or(0.8);
            let initial_muted = db
                .get_setting("muted")
                .ok()
                .flatten()
                .map(|s| s == "true")
                .unwrap_or(false);
            let engine = AudioEngine::new(
                app.handle().clone(),
                initial_eq,
                initial_vol,
                initial_muted,
            );
            if let Ok(Some(dev)) = db.get_setting("audio_device") {
                let _ = engine.set_output_device(&dev);
            }
            let http = providers::build_http_client();

            app.manage(AppState {
                db,
                engine,
                http,
                cache_dir,
                sys: Mutex::new(System::new()),
                play_seq: AtomicU64::new(0),
            });

            if let Some(win) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon().cloned() {
                    let _ = win.set_icon(icon);
                }
                #[cfg(windows)]
                if let Ok(hwnd) = win.hwnd() {
                    const GWL_STYLE: i32 = -16;
                    const WS_THICKFRAME: isize = 0x00040000;
                    const WS_SYSMENU: isize = 0x00080000;
                    const WS_MINIMIZEBOX: isize = 0x00020000;
                    const WS_MAXIMIZEBOX: isize = 0x00010000;
                    unsafe {
                        let h = hwnd.0 as isize;
                        let style = GetWindowLongPtrW(h, GWL_STYLE);
                        SetWindowLongPtrW(
                            h,
                            GWL_STYLE,
                            style | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX,
                        );
                    }
                }
                let _ = win.set_size(Size::Logical(LogicalSize::new(1200.0, 760.0)));
                let _ = win.center();
                let _ = win.set_focus();
            }

            let show_item = MenuItem::with_id(app, "show", "Open Awase", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Awase", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Awase")
                .on_menu_event(|app_handle, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _ = tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_library_tracks,
            commands::delete_tracks,
            commands::clear_library,
            commands::get_playlists,
            commands::get_playlist_tracks,
            commands::create_playlist,
            commands::add_track_to_playlist,
            commands::remove_track_from_playlist,
            commands::delete_playlist,
            commands::toggle_track_like,
            commands::get_local_folders,
            commands::add_local_folder,
            commands::remove_local_folder,
            commands::rescan_local_folders,
            commands::play_track,
            commands::pause_playback,
            commands::resume_playback,
            commands::stop_playback,
            commands::seek_playback,
            commands::set_volume,
            commands::set_muted,
            commands::get_telemetry,
            commands::get_equalizer,
            commands::set_equalizer,
            commands::get_audio_devices,
            commands::set_audio_device,
            commands::save_ui_prefs,
            commands::get_ui_prefs,
            commands::get_source_statuses,
            commands::search_source,
            commands::search_all_sources,
            commands::connect_yandex_token,
            commands::open_yandex_login_browser,
            commands::sync_yandex_library,
            commands::connect_spotify_credentials,
            commands::open_spotify_login_browser,
            commands::sync_spotify_library,
            commands::import_spotify_playlist_url,
            commands::import_spotify_file,
            commands::connect_soundcloud_token,
            commands::sync_soundcloud_library,
            commands::disconnect_source,
            commands::get_process_memory_mb,
            commands::show_main_window,
            commands::set_gaming_mode,
            commands::open_external_url,
            commands::update_discord_presence,
            commands::export_user_backup,
            commands::import_user_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running awase");
}
