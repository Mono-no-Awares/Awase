import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  ActiveView,
  AppPreferences,
  AudioDevice,
  AudioTelemetry,
  EqualizerState,
  FontFamilyChoice,
  FontScale,
  LocalFolder,
  Playlist,
  RepeatMode,
  SourceKind,
  SourceStatus,
  Track,
  WaveSource,
} from "./types";
import { extractCoverPalette, type CoverPalette } from "./lib/colorExtract";
import { SOURCE_META } from "./lib/sources";
import { api } from "./lib/ipc";
import { AwaseLogo } from "./components/AwaseIcons";
import { ChangelogModal } from "./components/ChangelogModal";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StageView } from "./components/StageView";
import { ResonanceView } from "./components/ResonanceView";
import { LibraryView } from "./components/LibraryView";
import { LyricsView } from "./components/LyricsView";
import { WrappedView } from "./components/WrappedView";
import { copyTrackShareCard } from "./lib/shareCard";
import { SourcesView } from "./components/SourcesView";
import { QueueDrawer } from "./components/QueueDrawer";
import { EqualizerPopover } from "./components/EqualizerPopover";
import { PlayerDock } from "./components/PlayerDock";

const INITIAL_TELEMETRY: AudioTelemetry = {
  isPlaying: false,
  currentTrackId: null,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  muted: false,
  sampleRateHz: 48000,
  channels: 2,
  codec: "READY",
  bitrateKbps: 0,
  deviceName: "Default WASAPI",
  spectrum: new Array(32).fill(0),
  rmsLeft: 0,
  rmsRight: 0,
  peak: 0,
};

const DEFAULT_PREFS: AppPreferences = {
  language: "ru",
  fontScale: "md",
  fontFamily: "dm",
  visualizerStyle: "aura",
  miniVisualizer: "bars",
  accentColor: "#E2E8F0",
  bgColor: "#050507",
  coverAdaptiveTheme: true,
  motionStyle: "silk",
  shareCardEnabled: true,
  wrappedEnabled: true,
  cacheAutoCleanDays: 0,
  lastSeenVersion: "",
  gamingMode: false,
  discordRpc: true,
  discordAppId: "",
  rpcStyle: "detailed",
  rpcShowIdle: true,
  rpcShowPaused: false,
  rpcHideOnPause: false,
  rpcShowButtons: true,
  rpcShowTimestamps: true,
  rpcShowSource: true,
  rpcIdleText: "",
};

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `${r} ${g} ${b}`;
    }
  }
  return "226 232 240";
}

const FONT_SIZE_MAP: Record<FontScale, string> = {
  sm: "14px",
  md: "16px",
  lg: "18px",
};

const FONT_FAMILY_MAP: Record<FontFamilyChoice, string> = {
  dm: "'DM Sans', 'Segoe UI Variable Text', system-ui, sans-serif",
  grotesk: "'Space Grotesk', system-ui, sans-serif",
  segoe: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Cascadia Mono', monospace",
};

function loadPrefs(): AppPreferences {
  try {
    const raw = localStorage.getItem("awase_prefs");
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export const App: React.FC = () => {
  const [booting, setBooting] = useState(true);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(loadPrefs);
  const [activeView, setActiveView] = useState<ActiveView>("stage");
  const [sourceFilter, setSourceFilter] = useState<SourceKind | "all" | "liked">("liked");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [waveSource, setWaveSource] = useState<WaveSource>("yandex");
  const [activeWave, setActiveWave] = useState<WaveSource | null>(null);
  const [waveLoading, setWaveLoading] = useState(false);
  const [scRetryTrack, setScRetryTrack] = useState<Track | null>(null);
  const [scAutoTuning, setScAutoTuning] = useState(false);
  const [eqState, setEqState] = useState<EqualizerState>({
    enabled: true,
    bands: [0, 0, 0, 0, 0],
  });

  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const queueRef = useRef<Track[]>([]);
  const currentIndexRef = useRef<number>(-1);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const consecSkipRef = useRef(0);
  const waveSeenIdsRef = useRef<Set<string>>(new Set());
  const lastRpcTrackIdRef = useRef<string | null>(null);
  const lastRpcPosRef = useRef<{ pos: number; ts: number }>({ pos: 0, ts: 0 });
  const handleNextRef = useRef<() => void>(() => {});
  const listenSessionRef = useRef<{
    track: Track | null;
    ms: number;
    lastTick: number;
  }>({ track: null, ms: 0, lastTick: 0 });

  const [telemetry, setTelemetry] = useState<AudioTelemetry>(INITIAL_TELEMETRY);
  const [coverPalette, setCoverPalette] = useState<CoverPalette>({
    primary: "#E2E8F0",
    secondary: "#A78BFA",
    glow: "rgba(226, 232, 240, 0.28)",
  });

  useEffect(() => {
    const fontCss = FONT_FAMILY_MAP[preferences.fontFamily];
    document.documentElement.style.fontSize = FONT_SIZE_MAP[preferences.fontScale];
    document.documentElement.style.setProperty("--awase-font", fontCss);
    document.documentElement.dataset.motion = preferences.motionStyle;
    document.documentElement.dataset.gaming = preferences.gamingMode ? "true" : "false";
    const json = JSON.stringify(preferences);
    try {
      localStorage.setItem("awase_prefs", json);
    } catch {}
    api.saveUiPrefs(json).catch(() => {});
  }, [preferences]);

  useEffect(() => {
    api.setGamingMode(preferences.gamingMode).catch(() => {});
  }, [preferences.gamingMode]);

  const toggleFullscreen = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      setIsFullscreen(next);
    } catch {}
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  const notify = useCallback((text: string, tone: "info" | "error" = "info") => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const refreshLibrary = useCallback(async () => {
    try {
      const [allTracks, allPlaylists, srcStatuses, localFolders] = await Promise.all([
        api.getLibraryTracks(),
        api.getPlaylists(),
        api.getSourceStatuses(),
        api.getLocalFolders(),
      ]);
      setTracks(allTracks);
      setPlaylists(allPlaylists);
      setStatuses(srcStatuses);
      setFolders(localFolders);
    } catch (err) {
      notify(String(err), "error");
    }
  }, [notify]);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useEffect(() => {
    let autoCleanDays = 0;
    let seenVer = "";
    api
      .getUiPrefs()
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.cacheAutoCleanDays === "number") {
            autoCleanDays = parsed.cacheAutoCleanDays;
          }
          if (typeof parsed.lastSeenVersion === "string") {
            seenVer = parsed.lastSeenVersion;
          }
          setPreferences((prev) => ({ ...prev, ...parsed }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (autoCleanDays >= 0) {
          api.cleanupNonFavoriteCache(autoCleanDays).catch(() => {});
        }
        if (seenVer !== "0.2.5") {
          window.setTimeout(() => setChangelogOpen(true), 1050);
        }
      });

    Promise.all([
      refreshLibrary(),
      new Promise((resolve) => window.setTimeout(resolve, 950)),
    ]).finally(() => {
      setBooting(false);
    });

    api
      .getAudioDevices()
      .then((list) => {
        setDevices(list);
        const def = list.find((d) => d.isDefault) ?? list[0];
        if (def) setSelectedDevice(def.name);
      })
      .catch(() => {});
    api.getEqualizer().then(setEqState).catch(() => {});
    api.getTelemetry().then(setTelemetry).catch(() => {});
  }, [refreshLibrary]);

  useEffect(() => {
    const intervalMs = preferences.gamingMode
      ? telemetry.isPlaying
        ? 500
        : 1000
      : activeView === "resonance" && telemetry.isPlaying
        ? 33
        : telemetry.isPlaying
          ? 120
          : 350;
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      api
        .getTelemetry()
        .then(setTelemetry)
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [telemetry.isPlaying, activeView, preferences.gamingMode]);

  const currentTrack = useMemo(() => {
    if (currentIndex >= 0 && currentIndex < queue.length) {
      return queue[currentIndex];
    }
    if (telemetry.currentTrackId) {
      return tracks.find((t) => t.id === telemetry.currentTrackId) ?? null;
    }
    return null;
  }, [currentIndex, queue, telemetry.currentTrackId, tracks]);

  useEffect(() => {
    const fallback = currentTrack ? SOURCE_META[currentTrack.source].accent : "#E2E8F0";
    extractCoverPalette(currentTrack?.coverUrl, fallback, "#A78BFA").then(setCoverPalette);
  }, [currentTrack?.id, currentTrack?.coverUrl, currentTrack?.source]);

  useEffect(() => {
    const useCover = currentTrack !== null;
    const activeAccent = useCover ? coverPalette.primary : "#E2E8F0";
    const activeAccent2 = useCover ? coverPalette.secondary : "#A78BFA";
    document.documentElement.style.setProperty("--awase-accent-rgb", hexToRgbTriplet(activeAccent));
    document.documentElement.style.setProperty("--awase-accent2-rgb", hexToRgbTriplet(activeAccent2));
    document.documentElement.style.setProperty("--awase-void", "#050507");
  }, [coverPalette, currentTrack]);

  const rpcLyricsRef = useRef<{
    trackId: string | null;
    lines: Array<{ timeMs: number | null; text: string }>;
    lastLine: string | null;
    lastPushTs: number;
  }>({ trackId: null, lines: [], lastLine: null, lastPushTs: 0 });

  useEffect(() => {
    if (!preferences.discordRpc || preferences.rpcStyle !== "lyrics" || !currentTrack) {
      rpcLyricsRef.current = { trackId: null, lines: [], lastLine: null, lastPushTs: 0 };
      return;
    }
    if (rpcLyricsRef.current.trackId === currentTrack.id) return;
    let cancelled = false;
    rpcLyricsRef.current = { trackId: currentTrack.id, lines: [], lastLine: null, lastPushTs: 0 };
    api
      .getTrackLyrics(currentTrack)
      .then((res) => {
        if (!cancelled && res.synced && res.lines.length > 0) {
          rpcLyricsRef.current.lines = res.lines;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [preferences.discordRpc, preferences.rpcStyle, currentTrack?.id]);

  const getActiveRpcLyric = useCallback((posMs: number) => {
    const lines = rpcLyricsRef.current.lines;
    if (!lines.length) return null;
    let active: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].timeMs;
      if (t !== null && t <= posMs + 300) {
        if (lines[i].text.trim()) active = lines[i].text.trim();
      } else if (t !== null && t > posMs + 300) {
        break;
      }
    }
    return active;
  }, []);

  const pushDiscordPresence = useCallback(
    (posOverrideMs?: number) => {
      const posMs = posOverrideMs ?? telemetry.positionMs;
      lastRpcPosRef.current = { pos: posMs, ts: performance.now() };
      const lyricLine =
        preferences.rpcStyle === "lyrics" ? getActiveRpcLyric(posMs) : null;
      if (lyricLine !== null) {
        rpcLyricsRef.current.lastLine = lyricLine;
      }
      rpcLyricsRef.current.lastPushTs = performance.now();
      api
        .updateDiscordPresence({
          enabled: preferences.discordRpc,
          appId: preferences.discordAppId,
          title: currentTrack?.title ?? null,
          artist: currentTrack?.artist ?? null,
          album: currentTrack?.album ?? null,
          coverUrl: currentTrack?.coverUrl ?? null,
          externalId: currentTrack?.externalId ?? null,
          isPlaying: telemetry.isPlaying,
          positionMs: posMs,
          durationMs: telemetry.durationMs || currentTrack?.durationMs || 0,
          source: currentTrack?.source ?? "local",
          codec: telemetry.codec || currentTrack?.codec || "",
          bitrateKbps: telemetry.bitrateKbps || currentTrack?.bitrateKbps || 0,
          sampleRateHz: telemetry.sampleRateHz || 0,
          activeView: lyricsOpen ? "lyrics" : activeView,
          lyricLine,
          rpcStyle: preferences.rpcStyle ?? "detailed",
          rpcShowIdle: preferences.rpcShowIdle !== false,
          rpcShowPaused: preferences.rpcShowPaused === true,
          rpcHideOnPause: preferences.rpcHideOnPause === true,
          rpcShowButtons: preferences.rpcShowButtons !== false,
          rpcShowTimestamps: preferences.rpcShowTimestamps !== false,
          rpcShowSource: preferences.rpcShowSource !== false,
          rpcIdleText: preferences.rpcIdleText ?? "",
        })
        .catch(() => {});
    },
    [
      preferences.discordRpc,
      preferences.discordAppId,
      preferences.rpcStyle,
      preferences.rpcShowIdle,
      preferences.rpcShowPaused,
      preferences.rpcHideOnPause,
      preferences.rpcShowButtons,
      preferences.rpcShowTimestamps,
      preferences.rpcShowSource,
      preferences.rpcIdleText,
      activeView,
      lyricsOpen,
      currentTrack?.id,
      currentTrack?.title,
      currentTrack?.artist,
      currentTrack?.album,
      currentTrack?.coverUrl,
      currentTrack?.externalId,
      currentTrack?.source,
      currentTrack?.durationMs,
      currentTrack?.codec,
      currentTrack?.bitrateKbps,
      telemetry.isPlaying,
      telemetry.positionMs,
      telemetry.durationMs,
      telemetry.codec,
      telemetry.bitrateKbps,
      telemetry.sampleRateHz,
      getActiveRpcLyric,
    ]
  );

  useEffect(() => {
    const trackChanged = lastRpcTrackIdRef.current !== (currentTrack?.id ?? null);
    lastRpcTrackIdRef.current = currentTrack?.id ?? null;
    pushDiscordPresence(trackChanged ? 0 : telemetry.positionMs);
  }, [
    preferences.discordRpc,
    preferences.discordAppId,
    preferences.rpcStyle,
    preferences.rpcShowIdle,
    preferences.rpcShowPaused,
    preferences.rpcHideOnPause,
    preferences.rpcShowButtons,
    preferences.rpcShowTimestamps,
    preferences.rpcShowSource,
    preferences.rpcIdleText,
    activeView,
    lyricsOpen,
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.album,
    currentTrack?.coverUrl,
    currentTrack?.source,
    currentTrack?.durationMs,
    telemetry.isPlaying,
  ]);

  useEffect(() => {
    if (!telemetry.isPlaying || !currentTrack) return;
    const expected =
      lastRpcPosRef.current.pos + (performance.now() - lastRpcPosRef.current.ts);
    if (Math.abs(telemetry.positionMs - expected) > 2500) {
      pushDiscordPresence(telemetry.positionMs);
      return;
    }
    if (preferences.discordRpc && preferences.rpcStyle === "lyrics") {
      const nextLine = getActiveRpcLyric(telemetry.positionMs);
      if (nextLine && nextLine !== rpcLyricsRef.current.lastLine) {
        pushDiscordPresence(telemetry.positionMs);
      }
    }
  }, [telemetry.positionMs, telemetry.isPlaying, currentTrack?.id, preferences.discordRpc, preferences.rpcStyle, getActiveRpcLyric]);

  const startTrackPlayback = useCallback(
    async (track: Track) => {
      try {
        setScRetryTrack(null);
        await api.playTrack(track);
        consecSkipRef.current = 0;
      } catch (err) {
        const msg = String(err);
        const isScUnavailable =
          track.source === "soundcloud" &&
          (msg.includes("[SC_UNAVAILABLE]") ||
            msg.includes("DRM") ||
            msg.includes("No SoundCloud streams"));
        if (isScUnavailable) {
          notify(
            preferences.language === "ru"
              ? "Трек недоступен (авторские права / регион) — пропускаю"
              : "Track unavailable (copyright / region) — skipping",
            "info"
          );
          if (consecSkipRef.current < 4) {
            consecSkipRef.current += 1;
            window.setTimeout(() => handleNextRef.current(), 320);
          }
          return;
        }
        const isYandexUnavailable =
          track.source === "yandex" &&
          (msg.includes("HTTP 404") ||
            msg.includes("HTTP 403") ||
            msg.includes("No Yandex stream"));
        if (isYandexUnavailable) {
          notify(
            preferences.language === "ru"
              ? "Трек Яндекса недоступен — пропускаю"
              : "Yandex track unavailable — skipping",
            "info"
          );
          if (consecSkipRef.current < 4) {
            consecSkipRef.current += 1;
            window.setTimeout(() => handleNextRef.current(), 250);
          }
          return;
        }
        notify(msg, "error");
        if (track.source === "soundcloud") {
          setScRetryTrack(track);
        }
      }
    },
    [notify, preferences.language]
  );

  const waveTrackKey = (t: Track) =>
    `${t.title.trim().toLowerCase()}|${t.artist.trim().toLowerCase()}`;

  const handlePlayTrack = useCallback(
    async (track: Track, list: Track[]) => {
      setActiveWave(null);
      const idx = list.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        setQueue(list);
        setCurrentIndex(idx);
      } else {
        setQueue([track, ...queue]);
        setCurrentIndex(0);
      }
      const nextAfter = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
      const nextAfter2 = idx >= 0 && idx + 2 < list.length ? list[idx + 2] : null;
      if (nextAfter) {
        window.setTimeout(() => api.prefetchTrack(nextAfter).catch(() => {}), 150);
      }
      if (nextAfter2) {
        window.setTimeout(() => api.prefetchTrack(nextAfter2).catch(() => {}), 850);
      }
      await startTrackPlayback(track);
    },
    [queue, startTrackPlayback]
  );

  const handleNext = useCallback(async () => {
    let workingQueue = queueRef.current;
    const curIdx = currentIndexRef.current;
    if (workingQueue.length === 0) return;
    if (repeat === "one" && curIdx >= 0 && curIdx < workingQueue.length) {
      await startTrackPlayback(workingQueue[curIdx]);
      return;
    }
    let nextIdx = curIdx + 1;

    const filterFreshWave = (items: Track[], existing: Track[]) => {
      const ids = new Set(existing.map((t) => t.id));
      return items.filter((t) => {
        const key = waveTrackKey(t);
        return (
          !ids.has(t.id) &&
          !waveSeenIdsRef.current.has(t.id) &&
          !waveSeenIdsRef.current.has(key)
        );
      });
    };

    if (shuffle && workingQueue.length > 1) {
      nextIdx = Math.floor(Math.random() * workingQueue.length);
    } else if (nextIdx >= workingQueue.length) {
      if (activeWave) {
        try {
          const more = await api.getWaveTracks(activeWave, false);
          const fresh = filterFreshWave(more, workingQueue);
          if (fresh.length > 0) {
            workingQueue = [...workingQueue, ...fresh];
            queueRef.current = workingQueue;
            setQueue(workingQueue);
          } else {
            return;
          }
        } catch {
          return;
        }
      } else if (repeat === "all") {
        nextIdx = 0;
      } else {
        return;
      }
    }

    if (workingQueue.length - nextIdx <= 3 && activeWave && !waveLoading) {
      api
        .getWaveTracks(activeWave, false)
        .then((more) => {
          if (more.length > 0) {
            setQueue((prev) => {
              const fresh = filterFreshWave(more, prev);
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
        })
        .catch(() => {});
    }
    const chosen = workingQueue[nextIdx];
    if (activeWave && chosen) {
      waveSeenIdsRef.current.add(chosen.id);
      waveSeenIdsRef.current.add(waveTrackKey(chosen));
      if (waveSeenIdsRef.current.size > 600) {
        waveSeenIdsRef.current.clear();
      }
    }
    currentIndexRef.current = nextIdx;
    setCurrentIndex(nextIdx);
    if (nextIdx + 1 < workingQueue.length) {
      const n1 = workingQueue[nextIdx + 1];
      window.setTimeout(() => api.prefetchTrack(n1).catch(() => {}), 150);
    }
    if (nextIdx + 2 < workingQueue.length) {
      const n2 = workingQueue[nextIdx + 2];
      window.setTimeout(() => api.prefetchTrack(n2).catch(() => {}), 850);
    }
    void startTrackPlayback(chosen);
  }, [repeat, shuffle, activeWave, waveLoading, startTrackPlayback]);

  useEffect(() => {
    handleNextRef.current = () => {
      void handleNext();
    };
  }, [handleNext]);

  const handleStartWave = useCallback(
    async (source: WaveSource) => {
      setWaveSource(source);
      setQueueOpen(false);
      setWaveLoading(true);
      try {
        let waveTracks = await api.getWaveTracks(source, true);
        const isUnseen = (t: Track) =>
          !waveSeenIdsRef.current.has(t.id) &&
          !waveSeenIdsRef.current.has(waveTrackKey(t));
        let fresh = waveTracks.filter(isUnseen);
        if (fresh.length === 0 && waveTracks.length > 0) {
          const secondBatch = await api.getWaveTracks(source, false).catch(() => []);
          fresh = secondBatch.filter(isUnseen);
          if (fresh.length > 0) waveTracks = fresh;
        } else if (fresh.length > 0) {
          waveTracks = fresh;
        }
        waveTracks.forEach((t) => {
          waveSeenIdsRef.current.add(t.id);
          waveSeenIdsRef.current.add(waveTrackKey(t));
        });
        if (waveSeenIdsRef.current.size > 600) {
          waveSeenIdsRef.current.clear();
        }
        if (waveTracks.length === 0) {
          notify(
            preferences.language === "ru"
              ? "Нет треков для волны — подключите сервис или добавьте лайки"
              : "No wave tracks found — connect a service or like some tracks",
            "error"
          );
          return;
        }
        setActiveWave(source);
        setQueue(waveTracks);
        setCurrentIndex(0);
        await startTrackPlayback(waveTracks[0]);
        if (waveTracks.length > 1) {
          window.setTimeout(() => api.prefetchTrack(waveTracks[1]).catch(() => {}), 150);
        }
        if (waveTracks.length > 2) {
          window.setTimeout(() => api.prefetchTrack(waveTracks[2]).catch(() => {}), 850);
        }
      } catch (err) {
        notify(String(err), "error");
      } finally {
        setWaveLoading(false);
      }
    },
    [notify, preferences.language, startTrackPlayback]
  );

  const handlePrev = useCallback(async () => {
    if (queue.length === 0) return;
    if (telemetry.positionMs > 4000) {
      await api.seekPlayback(0).catch(() => {});
      return;
    }
    const prevIdx = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIdx);
    await startTrackPlayback(queue[prevIdx]);
  }, [queue, currentIndex, telemetry.positionMs, startTrackPlayback]);

  useEffect(() => {
    const unlistenEnded = listen("awase://track-ended", () => {
      handleNext();
    });
    const unlistenOAuth = listen<{ source: string; ok: boolean; message: string }>(
      "awase://oauth-complete",
      (event) => {
        notify(event.payload.message, event.payload.ok ? "info" : "error");
        refreshLibrary();
      }
    );
    return () => {
      unlistenEnded.then((fn) => fn());
      unlistenOAuth.then((fn) => fn());
    };
  }, [handleNext, notify, refreshLibrary]);

  const handleTogglePlay = useCallback(async () => {
    if (!currentTrack && tracks.length > 0) {
      await handlePlayTrack(tracks[0], tracks);
      return;
    }
    if (telemetry.isPlaying) {
      await api.pausePlayback().catch(() => {});
    } else {
      await api.resumePlayback().catch(() => {});
    }
  }, [currentTrack, tracks, telemetry.isPlaying, handlePlayTrack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleTogglePlay]);

  const handleSearchSubmit = async (query: string) => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    setActiveView("library");
    setSelectedPlaylistId(null);
    try {
      const results = await api.searchAllSources(q);
      setSearchResults(results);
    } catch (err) {
      notify(`Search error: ${String(err)}`, "error");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddLocalFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Music Folder",
      });
      if (typeof selected === "string" && selected) {
        setBusySource("local");
        const count = await api.addLocalFolder(selected);
        notify(`Added ${count} tracks`);
        await refreshLibrary();
      }
    } catch (err) {
      notify(String(err), "error");
    } finally {
      setBusySource(null);
    }
  };

  const handleRescanLocal = async () => {
    setBusySource("local");
    try {
      const count = await api.rescanLocalFolders();
      notify(`Indexed ${count} local tracks`);
      await refreshLibrary();
    } catch (err) {
      notify(String(err), "error");
    } finally {
      setBusySource(null);
    }
  };

  const handleSelectPlaylist = async (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setSearchResults(null);
    setActiveView("library");
    try {
      const list = await api.getPlaylistTracks(playlistId);
      setPlaylistTracks(list);
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const handleToggleLike = async (trackId: string) => {
    try {
      const trackObj =
        queue.find((x) => x.id === trackId) ||
        tracks.find((x) => x.id === trackId) ||
        playlistTracks.find((x) => x.id === trackId) ||
        searchResults?.find((x) => x.id === trackId);
      const liked = await api.toggleTrackLike(trackId, trackObj);
      const patch = (arr: Track[]) =>
        arr.map((item) => (item.id === trackId ? { ...item, liked } : item));
      setTracks(patch);
      setPlaylistTracks(patch);
      setQueue(patch);
      if (searchResults) setSearchResults(patch(searchResults));
      if (liked && trackObj && !tracks.some((x) => x.id === trackId)) {
        setTracks((prev) => [{ ...trackObj, liked: true }, ...prev]);
      }
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const handleDislikeWave = async () => {
    if (!currentTrack) return;
    const target = currentTrack;
    notify(
      preferences.language === "ru"
        ? "Больше не буду предлагать этот трек"
        : "Won't recommend this track again",
      "info"
    );
    api.dislikeWaveTrack(target).catch(() => {});
    await handleNext();
  };

  const handleShareCard = async () => {
    if (!currentTrack) return;
    try {
      await copyTrackShareCard(currentTrack, coverPalette);
      notify(
        preferences.language === "ru"
          ? "Карточка трека скопирована в буфер обмена"
          : "Track card copied to clipboard",
        "info"
      );
    } catch (err) {
      notify(String(err), "error");
    }
  };

  useEffect(() => {
    const sess = listenSessionRef.current;
    const now = performance.now();
    if (sess.track && sess.track.id !== currentTrack?.id) {
      if (sess.ms >= 8000 && preferences.wrappedEnabled !== false) {
        api.recordListenEvent(sess.track, Math.round(sess.ms)).catch(() => {});
      }
      sess.track = currentTrack ?? null;
      sess.ms = 0;
      sess.lastTick = now;
    } else if (!sess.track && currentTrack) {
      sess.track = currentTrack;
      sess.ms = 0;
      sess.lastTick = now;
    }
  }, [currentTrack?.id, preferences.wrappedEnabled]);

  useEffect(() => {
    if (!telemetry.isPlaying || !currentTrack) {
      listenSessionRef.current.lastTick = performance.now();
      return;
    }
    const id = window.setInterval(() => {
      const sess = listenSessionRef.current;
      const now = performance.now();
      if (sess.lastTick > 0) {
        sess.ms += Math.min(2500, now - sess.lastTick);
      }
      sess.lastTick = now;
    }, 1000);
    return () => window.clearInterval(id);
  }, [telemetry.isPlaying, currentTrack?.id]);

  const filteredLibraryTracks = useMemo(() => {
    if (selectedPlaylistId) return playlistTracks;
    if (sourceFilter === "all") return tracks;
    if (sourceFilter === "liked") return tracks.filter((item) => item.liked);
    return tracks.filter((item) => item.source === sourceFilter);
  }, [tracks, playlistTracks, selectedPlaylistId, sourceFilter]);

  const likedCount = useMemo(() => tracks.filter((item) => item.liked).length, [tracks]);

  useEffect(() => {
    if (
      activeView === "library" &&
      !selectedPlaylistId &&
      sourceFilter === "liked" &&
      likedCount === 0 &&
      tracks.length > 0
    ) {
      setSourceFilter(tracks[0].source);
    }
  }, [activeView, selectedPlaylistId, sourceFilter, likedCount, tracks]);
  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050507] text-[#F1F5F9] overflow-hidden relative">
      <div
        className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-5 bg-[#050507] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          booting
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-[1.03] pointer-events-none"
        }`}
        style={{
          backgroundColor: "#050507",
          backgroundImage:
            "radial-gradient(circle at 50% 45%, rgba(167, 139, 250, 0.16), #050507 62%)",
        }}
      >
        <div className="relative flex items-center justify-center">
          <span className="absolute w-24 h-24 rounded-full bg-violet-400/20 blur-2xl animate-pulse" />
          <AwaseLogo size={58} className="relative z-10 transition-transform duration-700" />
        </div>
        <div className="font-display text-sm tracking-[0.28em] text-slate-200 uppercase">
          AWASE
        </div>
        <div className="w-36 h-1 rounded-full bg-white/[0.08] overflow-hidden relative">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-transparent via-violet-300 to-transparent animate-pulse" />
        </div>
      </div>

      <TitleBar
        language={preferences.language}
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          if (!val.trim()) setSearchResults(null);
        }}
        onSearchSubmit={handleSearchSubmit}
        isSearching={isSearching}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        gamingMode={preferences.gamingMode}
        onToggleGamingMode={() =>
          setPreferences((prev) => ({ ...prev, gamingMode: !prev.gamingMode }))
        }
      />

      <div
        className={`flex-1 flex min-h-0 relative z-10 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          booting ? "opacity-0 scale-[0.985]" : "opacity-100 scale-100"
        }`}
      >
        <Sidebar
          language={preferences.language}
          activeView={activeView}
          onSelectView={(v) => {
            setActiveView(v);
            if (v !== "library") setSelectedPlaylistId(null);
          }}
          sourceFilter={sourceFilter}
          onSelectSourceFilter={(f) => {
            setSelectedPlaylistId(null);
            setSearchResults(null);
            setSourceFilter(f);
          }}
          statuses={statuses}
          playlists={playlists}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={handleSelectPlaylist}
          onCreatePlaylist={async (name) => {
            try {
              const pl = await api.createPlaylist(name);
              setPlaylists((prev) => [pl, ...prev]);
              notify(`Created "${pl.name}"`);
            } catch (err) {
              notify(String(err), "error");
            }
          }}
          onDeletePlaylist={async (playlistId) => {
            try {
              await api.deletePlaylist(playlistId);
              if (selectedPlaylistId === playlistId) {
                setSelectedPlaylistId(null);
              }
              await refreshLibrary();
              notify("Playlist deleted");
            } catch (err) {
              notify(String(err), "error");
            }
          }}
          likedCount={likedCount}
          totalCount={tracks.length}
          wrappedEnabled={preferences.wrappedEnabled !== false}
        />

        <main className="flex-1 min-w-0 overflow-y-auto awase-scroll p-6">
          {activeView === "stage" && (
            <StageView
              language={preferences.language}
              tracks={tracks}
              currentTrack={currentTrack}
              telemetry={telemetry}
              statuses={statuses}
              coverPalette={coverPalette}
              gamingMode={preferences.gamingMode}
              onPlayTrack={handlePlayTrack}
              onTogglePlay={handleTogglePlay}
              onToggleLike={handleToggleLike}
              onQueueTrack={(track) => {
                setQueue((prev) => [...prev, track]);
                notify(`+ ${track.title}`);
              }}
              playlists={playlists}
              onAddToPlaylist={async (playlistId, track) => {
                try {
                  await api.addTrackToPlaylist(playlistId, track);
                  await refreshLibrary();
                  notify(`+ ${track.title}`);
                } catch (err) {
                  notify(String(err), "error");
                }
              }}
              onSelectView={setActiveView}
              onSelectSourceFilter={(src) => {
                setSelectedPlaylistId(null);
                setSourceFilter(src);
              }}
              onAddLocalFolder={handleAddLocalFolder}
            />
          )}

          {activeView === "resonance" && (
            <ResonanceView
              language={preferences.language}
              currentTrack={currentTrack}
              telemetry={telemetry}
              coverPalette={coverPalette}
              visualizerStyle={preferences.visualizerStyle}
              onSelectVisualizerStyle={(visualizerStyle) =>
                setPreferences((prev) => ({ ...prev, visualizerStyle }))
              }
              shuffle={shuffle}
              repeat={repeat}
              queueOpen={queueOpen && !activeWave}
              eqOpen={eqOpen}
              gamingMode={preferences.gamingMode}
              waveSource={waveSource}
              activeWave={activeWave}
              waveLoading={waveLoading}
              onChangeWaveSource={setWaveSource}
              onStartWave={handleStartWave}
              onStopWave={() => setActiveWave(null)}
              onDislikeWave={handleDislikeWave}
              onOpenLyrics={() => setLyricsOpen(true)}
              onShareCard={preferences.shareCardEnabled !== false ? handleShareCard : undefined}
              playlists={playlists}
              onAddToPlaylist={async (playlistId, track) => {
                try {
                  await api.addTrackToPlaylist(playlistId, track);
                  await refreshLibrary();
                  notify(`+ ${track.title}`);
                } catch (err) {
                  notify(String(err), "error");
                }
              }}
              onTogglePlay={handleTogglePlay}
              onPrev={handlePrev}
              onNext={handleNext}
              onSeek={(ms) => {
                api.seekPlayback(ms).catch(() => {});
                pushDiscordPresence(ms);
              }}
              onVolumeChange={(v) => {
                setTelemetry((prev) => ({ ...prev, volume: v, muted: false }));
                api.setVolume(v).catch(() => {});
              }}
              onToggleMute={() => {
                const next = !telemetry.muted;
                setTelemetry((prev) => ({ ...prev, muted: next }));
                api.setMuted(next).catch(() => {});
              }}
              onToggleShuffle={() => setShuffle((s) => !s)}
              onCycleRepeat={() =>
                setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))
              }
              onToggleLike={handleToggleLike}
              onToggleQueue={() => {
                setEqOpen(false);
                setQueueOpen((q) => !q);
              }}
              onToggleEq={() => {
                setQueueOpen(false);
                setEqOpen((o) => !o);
              }}
            />
          )}

          {activeView === "wrapped" && (
            <WrappedView
              language={preferences.language}
              coverPalette={coverPalette}
            />
          )}

          {activeView === "library" && (
            <LibraryView
              language={preferences.language}
              tracks={filteredLibraryTracks}
              searchResults={searchResults}
              searchQuery={searchQuery}
              sourceFilter={sourceFilter}
              selectedPlaylist={selectedPlaylist}
              currentTrackId={currentTrack?.id ?? null}
              isPlaying={telemetry.isPlaying}
              coverPalette={coverPalette}
              playlists={playlists}
              statuses={statuses}
              scanning={busySource === "local"}
              onOpenSettings={() => setActiveView("sources")}
              onSelectSourceFilter={(f) => {
                setSelectedPlaylistId(null);
                setSourceFilter(f);
              }}
              onClearSearch={() => {
                setSearchQuery("");
                setSearchResults(null);
              }}
              onPlayTrack={handlePlayTrack}
              onToggleLike={handleToggleLike}
              onQueueTrack={(track) => {
                setQueue((prev) => [...prev, track]);
                notify(`+ ${track.title}`);
              }}
              onAddToPlaylist={async (playlistId, track) => {
                try {
                  await api.addTrackToPlaylist(playlistId, track);
                  await refreshLibrary();
                  notify(`+ ${track.title}`);
                } catch (err) {
                  notify(String(err), "error");
                }
              }}
              onRemoveFromPlaylist={async (playlistId, track) => {
                try {
                  await api.removeTrackFromPlaylist(playlistId, track.id);
                  const updated = await api.getPlaylistTracks(playlistId);
                  setPlaylistTracks(updated);
                  await refreshLibrary();
                  notify(`- ${track.title}`);
                } catch (err) {
                  notify(String(err), "error");
                }
              }}
              onDeletePlaylist={async (playlistId) => {
                try {
                  await api.deletePlaylist(playlistId);
                  setSelectedPlaylistId(null);
                  await refreshLibrary();
                  notify("Playlist deleted");
                } catch (err) {
                  notify(String(err), "error");
                }
              }}
              onDeleteTracks={async (ids) => {
                await api.deleteTracks(ids);
                await refreshLibrary();
              }}
              onClearLibrary={async () => {
                const scope =
                  !selectedPlaylistId && sourceFilter !== "all" ? sourceFilter : undefined;
                const plId = selectedPlaylistId ?? undefined;
                await api.clearLibrary(scope, plId);
                if (!scope && !plId) {
                  setQueue([]);
                  setCurrentIndex(-1);
                }
                await refreshLibrary();
                if (plId) {
                  api.getPlaylistTracks(plId).then(setPlaylistTracks).catch(() => {});
                }
                notify(
                  preferences.language === "ru" ? "Список очищен" : "Cleared",
                  "info"
                );
              }}
              onRescanLocal={handleRescanLocal}
              onAddLocalFolder={handleAddLocalFolder}
            />
          )}

          {activeView === "sources" && (
            <SourcesView
              preferences={preferences}
              onUpdatePreferences={setPreferences}
              statuses={statuses}
              folders={folders}
              devices={devices}
              selectedDevice={selectedDevice}
              eqState={eqState}
              busySource={busySource}
              onAddLocalFolder={handleAddLocalFolder}
              onRemoveLocalFolder={async (path) => {
                await api.removeLocalFolder(path);
                await refreshLibrary();
              }}
              onRescanLocal={handleRescanLocal}
              onOpenYandexLogin={() =>
                api.openYandexLoginBrowser().catch((e) => notify(String(e), "error"))
              }
              onConnectYandexToken={async (token) => {
                setBusySource("yandex");
                try {
                  await api.connectYandexToken(token);
                  notify("Yandex Music connected");
                  await refreshLibrary();
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
              onSyncYandex={async () => {
                setBusySource("yandex");
                try {
                  const n = await api.syncYandexLibrary();
                  notify(`Synced ${n} Yandex tracks`);
                  await refreshLibrary();
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
              onOpenSpotifyWebLogin={() =>
                api.openSpotifyWebLogin().catch((e) => notify(String(e), "error"))
              }
              onSyncSpotify={async () => {
                setBusySource("spotify");
                try {
                  const n = await api.syncSpotifyLibrary();
                  notify(`Synced ${n} Spotify tracks`);
                  await refreshLibrary();
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
              onImportSpotifyUrl={async (url) => {
                setBusySource("spotify");
                try {
                  const n = await api.importSpotifyPlaylistUrl(url);
                  notify(`Imported ${n} Spotify tracks`);
                  await refreshLibrary();
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
              onImportSpotifyFile={async () => {
                try {
                  const selected = await open({
                    multiple: false,
                    filters: [{ name: "Spotify Export", extensions: ["csv", "json"] }],
                  });
                  const filePath = typeof selected === "string" ? selected : null;
                  if (filePath) {
                    setBusySource("spotify");
                    const n = await api.importSpotifyFile(filePath);
                    notify(`Imported ${n} Spotify tracks`);
                    await refreshLibrary();
                  }
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
              onConnectSoundcloud={async (token, handle) => {
                setBusySource("soundcloud");
                try {
                  await api.connectSoundcloudToken(token, handle);
                  notify("SoundCloud linked");
                  await refreshLibrary();
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
              onSyncSoundcloud={async () => {
                setBusySource("soundcloud");
                try {
                  const n = await api.syncSoundcloudLibrary();
                  notify(`Imported ${n} SoundCloud tracks`);
                  await refreshLibrary();
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
              onDisconnectSource={async (src) => {
                await api.disconnectSource(src);
                await refreshLibrary();
                notify(`Disconnected ${src}`);
              }}
              onSelectDevice={async (name) => {
                setSelectedDevice(name);
                await api.setAudioDevice(name).catch((e) => notify(String(e), "error"));
              }}
              onUpdateEq={async (next) => {
                setEqState(next);
                await api.setEqualizer(next).catch(() => {});
              }}
              onExportBackup={async () => {
                try {
                  await api.saveUiPrefs(JSON.stringify(preferences)).catch(() => {});
                  const filePath = await save({
                    defaultPath: "awase-backup.json",
                    filters: [{ name: "Awase Backup", extensions: ["json"] }],
                  });
                  if (filePath) {
                    await api.exportUserBackup(filePath);
                    notify("Backup exported");
                  }
                } catch (err) {
                  notify(String(err), "error");
                }
              }}
              onImportBackup={async () => {
                try {
                  const selected = await open({
                    multiple: false,
                    filters: [{ name: "Awase Backup", extensions: ["json"] }],
                  });
                  const filePath = typeof selected === "string" ? selected : null;
                  if (filePath) {
                    const restoredPrefs = await api.importUserBackup(filePath);
                    if (restoredPrefs) {
                      const parsed = JSON.parse(restoredPrefs);
                      setPreferences((prev) => {
                        const merged = { ...prev, ...parsed };
                        try {
                          localStorage.setItem("awase_prefs", JSON.stringify(merged));
                        } catch {}
                        return merged;
                      });
                    }
                    await api.getEqualizer().then(setEqState).catch(() => {});
                    await refreshLibrary();
                    notify("Backup imported");
                  }
                } catch (err) {
                  notify(String(err), "error");
                }
              }}
              onWipeData={async (keepCredentials) => {
                await api.wipeAppData(keepCredentials);
                setQueue([]);
                setCurrentIndex(-1);
                setActiveWave(null);
                waveSeenIdsRef.current.clear();
                await refreshLibrary();
                notify(
                  preferences.language === "ru"
                    ? keepCredentials
                      ? "Треки и плейлисты удалены (аккаунты сохранены)"
                      : "Все данные приложения удалены"
                    : keepCredentials
                      ? "Library & playlists wiped (accounts kept)"
                      : "All app data wiped",
                  "info"
                );
              }}
              onOpenExternalUrl={(url) =>
                api.openExternalUrl(url).catch((e) => notify(String(e), "error"))
              }
            />
          )}
        </main>

        <QueueDrawer
          open={queueOpen && !activeWave}
          language={preferences.language}
          queue={queue}
          currentIndex={currentIndex}
          coverPalette={coverPalette}
          onClose={() => setQueueOpen(false)}
          onSelectIndex={async (idx) => {
            setCurrentIndex(idx);
            await startTrackPlayback(queue[idx]);
          }}
          onRemoveIndex={(idx) => {
            setQueue((prev) => prev.filter((_, i) => i !== idx));
            if (idx < currentIndex) setCurrentIndex((c) => c - 1);
          }}
          onClearUpcoming={() => {
            if (currentTrack) {
              setQueue([currentTrack]);
              setCurrentIndex(0);
            } else {
              setQueue([]);
              setCurrentIndex(-1);
            }
          }}
        />
      </div>

      <EqualizerPopover
        open={eqOpen}
        language={preferences.language}
        eqState={eqState}
        onUpdate={async (next) => {
          setEqState(next);
          await api.setEqualizer(next).catch(() => {});
        }}
        onClose={() => setEqOpen(false)}
      />

      <LyricsView
        open={lyricsOpen}
        language={preferences.language}
        currentTrack={currentTrack}
        telemetry={telemetry}
        coverPalette={coverPalette}
        shuffle={shuffle}
        repeat={repeat}
        onClose={() => setLyricsOpen(false)}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={(ms) => api.seekPlayback(ms).catch(() => {})}
        onVolumeChange={(v) => {
          setTelemetry((prev) => ({ ...prev, volume: v, muted: false }));
          api.setVolume(v).catch(() => {});
        }}
        onToggleMute={() => {
          const next = !telemetry.muted;
          setTelemetry((prev) => ({ ...prev, muted: next }));
          api.setMuted(next).catch(() => {});
        }}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onCycleRepeat={() =>
          setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))
        }
        onToggleLike={handleToggleLike}
        onShareCard={preferences.shareCardEnabled !== false ? handleShareCard : undefined}
      />

      {scRetryTrack && (
        <div className="fixed bottom-40 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#101217]/95 border border-cyanpulse/40 backdrop-blur-xl text-xs text-white shadow-2xl awase-view-enter">
          <span className="text-slate-200">
            {preferences.language === "ru"
              ? "SoundCloud не загрузился. Включить встроенный RU-обход (без WinDivert)?"
              : "SoundCloud failed to load. Enable built-in RU bypass?"}
          </span>
          <button
            type="button"
            disabled={scAutoTuning}
            onClick={async () => {
              const target = scRetryTrack;
              setScAutoTuning(true);
              try {
                await api.setRuBypassMode(1);
                notify(
                  preferences.language === "ru"
                    ? "Встроенный RU-обход включён"
                    : "Built-in RU bypass enabled"
                );
                setScRetryTrack(null);
                if (target) {
                  await startTrackPlayback(target);
                }
              } catch (err) {
                notify(String(err), "error");
              } finally {
                setScAutoTuning(false);
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-cyanpulse text-[#050507] font-semibold hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {scAutoTuning
              ? preferences.language === "ru"
                ? "Повтор..."
                : "Retrying..."
              : preferences.language === "ru"
                ? "Включить и повторить"
                : "Enable & Retry"}
          </button>
          <button
            type="button"
            onClick={() => setScRetryTrack(null)}
            className="px-2 py-1 text-slate-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-28 right-6 z-[60] max-w-[360px] w-auto px-3.5 py-2.5 rounded-2xl border backdrop-blur-2xl shadow-[0_18px_48px_rgba(0,0,0,0.78)] flex items-center gap-3 awase-view-enter ${
            toast.tone === "error"
              ? "bg-[#170E12]/95 border-rose-500/30 text-rose-100"
              : "bg-[#0B0B0E]/95 border-white/[0.12] text-white"
          }`}
        >
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${
              toast.tone === "error"
                ? "bg-rose-500/15 border-rose-500/25 text-rose-400"
                : "bg-white/[0.08] border-white/[0.12] text-white"
            }`}
          >
            {toast.tone === "error" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium leading-snug text-white/95">
              {toast.text}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors text-xs leading-none cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <PlayerDock
        language={preferences.language}
        currentTrack={currentTrack}
        telemetry={telemetry}
        coverPalette={coverPalette}
        shuffle={shuffle}
        repeat={repeat}
        queueOpen={queueOpen && !activeWave}
        hideQueue={activeWave !== null}
        eqOpen={eqOpen}
        lyricsOpen={lyricsOpen}
        resonanceActive={activeView === "resonance"}
        miniVisualizer={preferences.miniVisualizer}
        gamingMode={preferences.gamingMode}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={(ms) => api.seekPlayback(ms).catch(() => {})}
        onVolumeChange={(v) => {
          setTelemetry((prev) => ({ ...prev, volume: v, muted: false }));
          api.setVolume(v).catch(() => {});
        }}
        onToggleMute={() => {
          const next = !telemetry.muted;
          setTelemetry((prev) => ({ ...prev, muted: next }));
          api.setMuted(next).catch(() => {});
        }}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onCycleRepeat={() =>
          setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))
        }
        onToggleLike={handleToggleLike}
        onToggleQueue={() => {
          setEqOpen(false);
          setQueueOpen((q) => !q);
        }}
        onToggleEq={() => {
          setQueueOpen(false);
          setEqOpen((o) => !o);
        }}
        onToggleLyrics={() => {
          setQueueOpen(false);
          setEqOpen(false);
          setLyricsOpen((l) => !l);
        }}
        onToggleResonance={() => {
          setLyricsOpen(false);
          setActiveView((v) => (v === "resonance" ? "stage" : "resonance"));
        }}
      />
      <ChangelogModal
        open={changelogOpen}
        version="0.2.5"
        language={preferences.language}
        onClose={() => {
          setChangelogOpen(false);
          setPreferences((prev) => ({ ...prev, lastSeenVersion: "0.2.5" }));
        }}
      />
    </div>
  );
};
