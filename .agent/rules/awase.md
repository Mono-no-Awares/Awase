---
trigger: always_on
---

# Awase Project Rules & Context

## Communication & Release Notes
- Reply concisely in Russian with clickable `file:///` links to edited files and built binaries.
- GitHub Release descriptions/changelogs for the user must be written in **English** (`## Awase vX.Y.Z`), accompanied by git push commands (`git push origin main --tags`).

## Code Style & UI Constraints
- **Zero code comments** (`//`, `/*`, `<!--`) in `src/`, `src-tauri/src/`, and `index.html`.
- No native browser `title="..."` hover tooltips on UI elements, and keep the global `contextmenu` blocker active (except text inputs).
- Keep the OLED neutral dark theme (`#050507`, `bg-black/40`, `awase-glass`) — avoid bluish tints (`#0C0E14`, `#0D111A`).
- Cover-adaptive accent colors are always enabled (`--awase-accent-rgb` / `--awase-accent2-rgb`); do not re-add manual color pickers or ambient gradient toggles.
- Equalizer curve and UI accents must follow `rgb(var(--awase-accent-rgb))`.

## Windows Build & Verification Toolchain
- Always stop running `awase.exe` before building: `taskkill /F /IM awase.exe 2>$null | Out-Null`
- Always prepend AwaseBuildTools to `PATH` and use `npm.cmd`:
  ```powershell
  $toolsDir = "$env:LOCALAPPDATA\Programs\AwaseBuildTools"
  $env:PATH = "$toolsDir\winlibs\bin;$toolsDir\nodejs;$env:USERPROFILE\.cargo\bin;$env:PATH"
  npm.cmd run tauri build
  ```
- After building, smoke-test `src-tauri\target\release\awase.exe` (`Start-Process` -> wait 3s -> verify `HasExited=False` -> stop process).
- Keep Rust compilation free of dead_code/unused warnings.

## Versioning Checklist
When releasing a new version (currently `0.2.5`):
1. Bump version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/components/SourcesView.tsx` fallback, and `src/App.tsx` (`lastSeenVersion` / `<ChangelogModal version="..." />`).
2. Update `ITEMS_RU` and `ITEMS_EN` in `src/components/ChangelogModal.tsx` with the full changelog for the new version.

## Key Architecture Decisions (Preserve)
- **Spotify:** Premium-only via official Web Playback SDK (`src-tauri/src/spotify_player.rs`), 1-click web login (no Client ID fields), playlist URL & CSV/JSON import.
- **SoundCloud:** Built-in RU 16KB bypass defaults to `Always` (`1`), parallel 12 Range chunks & 8 HLS segments; Zapret/WinDivert is removed.
- **Yandex Music:** Stream quality selector (`320 kbps` High / `192 kbps` Fast), persistent My Wave history (`wave_seen_v1`, `wave_last_track_id_v1`).
- **Performance:** `find_cached_track` skips network calls for cached tracks, `run_dedup_download` deduplicates in-flight downloads, 2-track lookahead prefetch, `spawn_blocking` for decoder start, `React.memo` on `Sidebar` and `TitleBar`, and auto-cleanup of non-favorite cache on startup (`cacheAutoCleanDays = 0`).
- **Audio Engine (`src-tauri/src/audio_engine.rs`):** 5-band EQ (`low_shelf` + `peaking` + `high_shelf`, 8 presets), real-time DSP effects (`Normal`, `Slowed + Reverb`, `Nightcore`), and `Crossfade` (`0–8s`).
- **UI & RPC:** Floating Always-on-Top `MiniPlayer.tsx`, `ResonanceView` Play button centered via `grid-cols-[1fr_auto_1fr]` with Add-to-Playlist to the right of EQ, `LibraryView` without `All` tab (connected sources only + empty connect prompt), and `latest-wins` Discord RPC worker (`Show When Paused` off by default, Awase icon in Idle).
