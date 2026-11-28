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
- Equalizer curve, UI accents, and all Settings toggle switches must follow the cover-adaptive accent color (`rgb(var(--awase-accent-rgb))` / `bg-cyanpulse`), matching the existing toggles.

## Windows Build & Verification Toolchain
- Always stop running `awase.exe` before building: `taskkill /F /IM awase.exe 2>$null | Out-Null`
- Always prepend AwaseBuildTools to `PATH` and use `npm.cmd`:
  ```powershell
  $toolsDir = "$env:LOCALAPPDATA\Programs\AwaseBuildTools"
  $env:PATH = "$toolsDir\winlibs\bin;$toolsDir\nodejs;$env:USERPROFILE\.cargo\bin;$env:PATH"
  npm.cmd run tauri build
  ```
- After building, smoke-test `src-tauri\target\release\awase.exe` (`Start-Process` -> wait 3s -> verify `HasExited=False` -> stop process).
- Always produce the NSIS installer bundle as well (`npm.cmd run tauri build` with `BypassSandbox: true` if `nsis` needs network download/verification).
- Keep Rust compilation free of dead_code/unused warnings.

## Versioning & Release Checklist
When releasing a new version (currently `0.2.6`):
1. Bump version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/components/SourcesView.tsx` fallback (so Settings & the auto-update checker display/compare the new version), and `src/App.tsx` (`lastSeenVersion` / `<ChangelogModal version="..." />`).
2. Update `ITEMS_RU` and `ITEMS_EN` in `src/components/ChangelogModal.tsx` with the full changelog for the new version.
3. Update `README.md` (English) and `README.ru.md` (Russian) if major features were added.
4. Build `awase.exe`, smoke-test it, and build the NSIS installer (`Awase_<ver>_x64-setup.exe`).
5. Commit changes (`git add` / `git commit`) and create annotated/lightweight tag (`git tag vX.Y.Z`), then provide the English GitHub Release description (`## Awase vX.Y.Z`) and push commands (`git push origin main --tags`).

## Key Architecture Decisions (Preserve)
- **Spotify:** Premium-only via official Web Playback SDK (`src-tauri/src/spotify_player.rs`), 1-click web login (no Client ID fields), playlist URL & CSV/JSON import.
- **SoundCloud:** Built-in RU 16KB bypass defaults to `Always` (`1`), parallel 12 Range chunks & 8 HLS segments; Zapret/WinDivert is removed.
- **Yandex Music:** Stream quality selector (`320 kbps` High / `192 kbps` Fast), persistent My Wave history (`wave_seen_v1`, `wave_last_track_id_v1`).
- **Performance:** `find_cached_track` skips network calls for cached tracks, `run_dedup_download` deduplicates in-flight downloads, 2-track lookahead prefetch, `spawn_blocking` for decoder start, `React.memo` on `Sidebar` and `TitleBar`, and auto-cleanup of non-favorite cache on startup (`cacheAutoCleanDays = 0`).
- **Audio Engine (`src-tauri/src/audio_engine.rs`):** 5-band EQ (`low_shelf` + `peaking` + `high_shelf`, 8 presets), real-time DSP effects (`Normal`, `Slowed + Reverb`, `Nightcore`), and `Crossfade` (`0–8s`).
- **UI & RPC:** Floating Always-on-Top `MiniPlayer.tsx`, `ResonanceView` Play button centered via `grid-cols-[1fr_auto_1fr]` with Add-to-Playlist to the right of EQ, `LibraryView` without `All` tab (connected sources only + empty connect prompt), and `latest-wins` Discord RPC worker (`Show When Paused` off by default, Awase icon in Idle).

## Chat Handoff Protocol
- When the user writes the code phrase **"переходим в след чат"** (or similar), immediately update this file (`.agent/rules/awase.md`):
  1. Preserve all existing rules, constraints, and architecture decisions.
  2. Update the `## Current Progress / Where We Left Off` section below with: what was just completed, any new rules/decisions agreed upon, modified files, build/test status, and the exact next steps.
  3. Confirm briefly in Russian that the state is saved and ready for the next chat.

## Current Progress / Where We Left Off
- Version `0.2.5` is current. No pending uncommitted tasks; ready for the next feature or fix.
