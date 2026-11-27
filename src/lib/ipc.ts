import { invoke } from "@tauri-apps/api/core";
import type {
  AudioDevice,
  AudioTelemetry,
  EqualizerState,
  LocalFolder,
  LyricsPayload,
  Playlist,
  SourceKind,
  SourceStatus,
  Track,
  ZapretStatus,
} from "../types";

export const api = {
  getLibraryTracks: (source?: SourceKind | "all", query?: string) =>
    invoke<Track[]>("get_library_tracks", {
      source: source && source !== "all" ? source : null,
      query: query ?? null,
    }),
  deleteTracks: (trackIds: string[]) => invoke<void>("delete_tracks", { trackIds }),
  clearLibrary: (scope?: string, playlistId?: string) =>
    invoke<void>("clear_library", { scope: scope ?? null, playlistId: playlistId ?? null }),
  wipeAppData: (keepCredentials: boolean) =>
    invoke<void>("wipe_app_data", { keepCredentials }),
  getPlaylists: () => invoke<Playlist[]>("get_playlists"),
  getPlaylistTracks: (playlistId: string) =>
    invoke<Track[]>("get_playlist_tracks", { playlistId }),
  createPlaylist: (name: string, description?: string) =>
    invoke<Playlist>("create_playlist", { name, description: description ?? null }),
  addTrackToPlaylist: (playlistId: string, track: Track) =>
    invoke<void>("add_track_to_playlist", { playlistId, track }),
  removeTrackFromPlaylist: (playlistId: string, trackId: string) =>
    invoke<void>("remove_track_from_playlist", { playlistId, trackId }),
  deletePlaylist: (playlistId: string) => invoke<void>("delete_playlist", { playlistId }),
  toggleTrackLike: (trackId: string, track?: Track) =>
    invoke<boolean>("toggle_track_like", { trackId, track: track ?? null }),
  dislikeWaveTrack: (track: Track) =>
    invoke<void>("dislike_wave_track", { track }),
  getLocalFolders: () => invoke<LocalFolder[]>("get_local_folders"),
  addLocalFolder: (path: string) => invoke<number>("add_local_folder", { path }),
  removeLocalFolder: (path: string) => invoke<void>("remove_local_folder", { path }),
  rescanLocalFolders: () => invoke<number>("rescan_local_folders"),
  playTrack: (track: Track) => invoke<void>("play_track", { track }),
  pausePlayback: () => invoke<void>("pause_playback"),
  resumePlayback: () => invoke<void>("resume_playback"),
  stopPlayback: () => invoke<void>("stop_playback"),
  seekPlayback: (positionMs: number) => invoke<void>("seek_playback", { positionMs }),
  setVolume: (volume: number) => invoke<void>("set_volume", { volume }),
  setMuted: (muted: boolean) => invoke<void>("set_muted", { muted }),
  getTelemetry: () => invoke<AudioTelemetry>("get_telemetry"),
  getEqualizer: () => invoke<EqualizerState>("get_equalizer"),
  setEqualizer: (state: EqualizerState) => invoke<void>("set_equalizer", { eqState: state }),
  getAudioDevices: () => invoke<AudioDevice[]>("get_audio_devices"),
  setAudioDevice: (deviceName: string) => invoke<void>("set_audio_device", { deviceName }),
  saveUiPrefs: (prefsJson: string) => invoke<void>("save_ui_prefs", { prefsJson }),
  getUiPrefs: () => invoke<string | null>("get_ui_prefs"),
  getSourceStatuses: () => invoke<SourceStatus[]>("get_source_statuses"),
  searchSource: (source: SourceKind, query: string) =>
    invoke<Track[]>("search_source", { source, query }),
  searchAllSources: (query: string) => invoke<Track[]>("search_all_sources", { query }),
  connectYandexToken: (token: string) => invoke<SourceStatus>("connect_yandex_token", { token }),
  openYandexLoginBrowser: () => invoke<void>("open_yandex_login_browser"),
  syncYandexLibrary: () => invoke<number>("sync_yandex_library"),
  connectSpotifyCredentials: (clientId: string, accessToken?: string) =>
    invoke<SourceStatus>("connect_spotify_credentials", {
      clientId,
      accessToken: accessToken ?? null,
    }),
  openSpotifyLoginBrowser: (clientId: string) =>
    invoke<void>("open_spotify_login_browser", { clientId }),
  syncSpotifyLibrary: () => invoke<number>("sync_spotify_library"),
  importSpotifyPlaylistUrl: (url: string) =>
    invoke<number>("import_spotify_playlist_url", { url }),
  importSpotifyFile: (filePath: string) =>
    invoke<number>("import_spotify_file", { filePath }),
  connectSoundcloudToken: (token: string, profileHandle?: string) =>
    invoke<SourceStatus>("connect_soundcloud_token", {
      token,
      profileHandle: profileHandle ?? null,
    }),
  syncSoundcloudLibrary: () => invoke<number>("sync_soundcloud_library"),
  disconnectSource: (source: SourceKind) => invoke<void>("disconnect_source", { source }),
  getProcessMemoryMb: () => invoke<number>("get_process_memory_mb"),
  showMainWindow: () => invoke<void>("show_main_window"),
  setGamingMode: (enabled: boolean) => invoke<void>("set_gaming_mode", { enabled }),
  openExternalUrl: (url: string) => invoke<void>("open_external_url", { url }),
  updateDiscordPresence: (payload: {
    enabled: boolean;
    appId: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    coverUrl: string | null;
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
    source: string;
  }) => invoke<void>("update_discord_presence", payload),
  exportUserBackup: (filePath: string) => invoke<void>("export_user_backup", { filePath }),
  importUserBackup: (filePath: string) => invoke<string | null>("import_user_backup", { filePath }),
  getWaveTracks: (source: "yandex" | "soundcloud" | "mix", reset?: boolean) =>
    invoke<Track[]>("get_wave_tracks", { source, reset }),
  getZapretStatus: () => invoke<ZapretStatus>("get_zapret_status"),
  installZapret: () => invoke<ZapretStatus>("install_zapret"),
  setZapretEnabled: (enabled: boolean) => invoke<ZapretStatus>("set_zapret_enabled", { enabled }),
  getRuBypassStatus: () => invoke<[number, boolean]>("get_ru_bypass_status"),
  setRuBypassMode: (mode: number) => invoke<[number, boolean]>("set_ru_bypass_mode", { mode }),
  prefetchTrack: (track: Track) => invoke<void>("prefetch_track", { track }),
  fetchCoverCached: (url: string) => invoke<string>("fetch_cover_cached", { url }),
  getTrackLyrics: (track: Track) => invoke<LyricsPayload>("get_track_lyrics", { track }),
  getCacheStats: () => invoke<import("../types").CacheStats>("get_cache_stats"),
  clearCache: () => invoke<import("../types").CacheStats>("clear_cache"),
  checkForUpdates: () => invoke<import("../types").UpdateCheckResult>("check_for_updates"),
  recordListenEvent: (track: Track, listenedMs: number) =>
    invoke<void>("record_listen_event", { track, listenedMs }),
  getWrappedStats: () => invoke<import("../types").WrappedStatsData>("get_wrapped_stats"),
};
