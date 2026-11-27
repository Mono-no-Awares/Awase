<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Awase Logo" width="84" />

# Awase

**Fast, low-RAM Windows desktop music player in Rust — unifying Local Lossless, Yandex Music, Spotify & SoundCloud.**

**English** | [Русский](README.ru.md) 

![Rust](https://img.shields.io/badge/Rust-1.80+-f97316?style=flat-square&logo=rust&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18%20%2B%20TS-38bdf8?style=flat-square&logo=react&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2011-0078d4?style=flat-square&logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0-crimson?style=flat-square)

</div>

---

## Preview

| Resonance — Aura | Fullscreen Lyrics |
| :---: | :---: |
| ![Awase Resonance — Aura](assets/resonance-aura-v2.png) | ![Awase Fullscreen Lyrics](assets/lyrics-v2.png) |
| **Library** | **Settings & Equalizer** |
| ![Awase Library](assets/library-v2.png) | ![Awase Settings & Equalizer](assets/settings-v2.png) |

---

## Features

- **Unified Library** — Combine local lossless folders (`FLAC`, `WAV`, `MP3`, `M4A`, `AAC`, `OGG` with embedded cover art) alongside **Yandex Music**, **Spotify**, and **SoundCloud** in a single high-FPS virtualized library.
- **Native Rust Audio Engine & 5-Band EQ** — Powered by `rodio` + `symphonia` + `rustfft` with real-time 32-band FFT spectrum telemetry, musical 5-band parametric/shelf equalizer (`60Hz` – `14kHz`) with automatic preamp headroom and 8 presets, and custom output device selection.
- **Resonance Visualizers** — Three cover-color-reactive Canvas visualizers (**Aura**, **Silk**, **Orbital**) with integrated playback controls and `F11` fullscreen mode.
- **Spotify Premium SDK & Native SoundCloud HLS/fMP4** — Direct Spotify Premium playback via official Web Playback SDK (`>100` track playlists, likes & `.csv`/`.json` import), plus native Rust MPEG-TS & fMP4-to-ADTS-AAC demuxing and built-in RU ISP bypass for SoundCloud streams.
- **Cover-Adaptive & Custom Themes** — Pure OLED obsidian interface that adapts accents to the current track's album art, or lets you pick custom accent/background colors, typography, and motion presets (`Fluid`, `Snappy`, `Silk`).
- **Discord Rich Presence** — Native Windows Named Pipe IPC (`Listening to ...`) with track title, artist, cover art, and live progress bar (toggleable in Settings).
- **Gaming Mode & System Tray** — One-click **Gaming Mode** disables canvas rendering & view animations and throttles telemetry for minimal background RAM/CPU. Closing the window minimizes smoothly to the Windows system tray.
- **Full Settings Backup** — Export and import your UI preferences, EQ curve, local folders, playlists, and connected tokens as a single `.json` file.

---

## Architecture

| Module | Responsibility | Stack | Files |
| :--- | :--- | :--- | :--- |
| **Audio Engine** | Real-time decoding, 5-band biquad EQ, FFT spectrum analysis, and WASAPI device routing. | Rust (`rodio`, `cpal`, `rustfft`) | `src-tauri/src/audio_engine.rs` |
| **Providers** | Native API clients, HLS/MPEG-TS/fMP4 demuxing, Spotify embed/CSV/JSON importer, and local tag scanner. | Rust (`reqwest`, `lofty`, `roxmltree`) | `src-tauri/src/providers/*`, `src-tauri/src/local_scanner.rs` |
| **Core & IPC** | SQLite persistence, Windows system tray, Discord Rich Presence IPC, and Tauri commands. | Rust (`rusqlite`, `tauri`) | `src-tauri/src/db.rs`, `src-tauri/src/discord_rpc.rs`, `src-tauri/src/commands.rs` |
| **Desktop UI** | Virtualized library, Resonance visualizers, Queue drawer, custom EQ faders, and Theme customizer. | React, TypeScript, Tailwind CSS | `src/App.tsx`, `src/components/*` |

```mermaid
flowchart LR
  UI["React + Tailwind UI"] <-->|"Tauri IPC"| CMD["Tauri Commands"]
  CMD -->|"Track & Playlist Store"| DB["SQLite (awase.db)"]
  CMD -->|"Resolve & Cache"| PROV["Providers (Yandex / Spotify / SoundCloud / Local)"]
  PROV -->|"Audio File"| ENG["Rust Audio Engine (rodio + Biquad EQ + FFT)"]
  ENG -->|"WASAPI"| OUT["Audio Output Device"]
  ENG -->|"32-band Spectrum"| UI
  CMD -->|"Named Pipe"| RPC["Discord Rich Presence"]
```

---

## Installation (Windows)

1. Download the latest `Awase_*_x64-setup.exe` from [Releases](https://github.com/Mono-no-Awares/Awase/releases).
2. Run the installer (per-user install, no administrator privileges required).

---

## Build from Source

### Prerequisites

- **Rust** (stable toolchain)
- **Node.js** (v20+)
- **Windows 10/11** with WebView2 Runtime

### Commands

```bash
npm install
npm run tauri build
```

The standalone executable and NSIS installer will be generated in `src-tauri/target/release/`.

---

## Privacy & Security

- All credentials, tokens, playlists, and cached audio stay **100% locally** on your machine (`%APPDATA%\dev.mononoawares.awase\`).
- Awase does not include analytics, telemetry, or third-party tracking.

---

## Contributors

- **[StrongDeep01](https://github.com/StrongDeep01)** — QA & Beta Testing (SoundCloud, Yandex My Wave, Lyrics, Discord RPC)

---

## License

**PolyForm Noncommercial License 1.0.0** © [Mono-no-Awares](https://github.com/Mono-no-Awares) — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

- **Allowed:** Personal, educational, and non-commercial use, inspection, and non-commercial forks with preserved attribution and link to [Mono-no-Awares/Awase](https://github.com/Mono-no-Awares/Awase).
- **Prohibited:** Selling, reselling, monetizing, commercial redistribution, or embedding into commercial products/services without explicit written permission (`mononoawares.dev@gmail.com`). The Awase name, logo, and icons are not licensed for impersonation.
