import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StageView } from "./components/StageView";
import { ResonanceView } from "./components/ResonanceView";
import { LibraryView } from "./components/LibraryView";
import { LyricsView } from "./components/LyricsView";
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
  gamingMode: false,
  discordRpc: true,
  discordAppId: "",
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
  const [preferences, setPreferences] = useState<AppPreferences>(loadPrefs);
  const [activeView, setActiveView] = useState<ActiveView>("stage");
  const [sourceFilter, setSourceFilter] = useState<SourceKind | "all" | "liked">("all");
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
    api
      .getUiPrefs()
      .then((raw) => {
        if (raw) {
          setPreferences((prev) => ({ ...prev, ...JSON.parse(raw) }));
        }
      })
      .catch(() => {});

    Promise.all([
      refreshLibrary(),
      new Promise((resolve) => window.setTimeout(resolve, 420)),
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
      : telemetry.isPlaying || activeView === "resonance"
        ? 33
        : 220;
    const timer = window.setInterval(() => {
      api
        .getTelemetry()
        .then(setTelemetry)
        .catch(() => {});
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
    const useCover = preferences.coverAdaptiveTheme && currentTrack !== null;
    const activeAccent = useCover ? coverPalette.primary : preferences.accentColor;
    const activeAccent2 = useCover ? coverPalette.secondary : "#A78BFA";
    const activeBg = preferences.coverAdaptiveTheme ? "#050507" : preferences.bgColor;
    document.documentElement.style.setProperty("--awase-accent-rgb", hexToRgbTriplet(activeAccent));
    document.documentElement.style.setProperty("--awase-accent2-rgb", hexToRgbTriplet(activeAccent2));
    document.documentElement.style.setProperty("--awase-void", activeBg);
  }, [
    preferences.coverAdaptiveTheme,
    preferences.accentColor,
    preferences.bgColor,
    coverPalette,
    currentTrack,
  ]);

  useEffect(() => {
    api
      .updateDiscordPresence({
        enabled: preferences.discordRpc,
        appId: preferences.discordAppId,
        title: currentTrack?.title ?? null,
        artist: currentTrack?.artist ?? null,
        album: currentTrack?.album ?? null,
        coverUrl: currentTrack?.coverUrl ?? null,
        isPlaying: telemetry.isPlaying,
        positionMs: telemetry.positionMs,
        durationMs: telemetry.durationMs || currentTrack?.durationMs || 0,
        source: currentTrack?.source ?? "local",
      })
      .catch(() => {});
  }, [
    preferences.discordRpc,
    preferences.discordAppId,
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.album,
    currentTrack?.coverUrl,
    currentTrack?.source,
    currentTrack?.durationMs,
    telemetry.isPlaying,
  ]);

  const startTrackPlayback = useCallback(
    async (track: Track) => {
      try {
        setScRetryTrack(null);
        await api.playTrack(track);
      } catch (err) {
        notify(`${String(err)}`, "error");
        if (track.source === "soundcloud") {
          setScRetryTrack(track);
        }
      }
    },
    [notify]
  );

  const handlePlayTrack = useCallback(
    async (track: Track, list: Track[]) => {
      const idx = list.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        setQueue(list);
        setCurrentIndex(idx);
      } else {
        setQueue([track, ...queue]);
        setCurrentIndex(0);
      }
      await startTrackPlayback(track);
      const nextAfter = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
      if (nextAfter) {
        api.prefetchTrack(nextAfter).catch(() => {});
      }
    },
    [queue, startTrackPlayback]
  );

  const handleNext = useCallback(async () => {
    if (queue.length === 0) return;
    if (repeat === "one" && currentIndex >= 0) {
      await startTrackPlayback(queue[currentIndex]);
      return;
    }
    let nextIdx = currentIndex + 1;
    if (shuffle && queue.length > 1) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else if (nextIdx >= queue.length) {
      if (repeat === "all") nextIdx = 0;
      else return;
    }
    if (queue.length - nextIdx <= 2 && activeWave && !waveLoading) {
      api
        .getWaveTracks(activeWave)
        .then((more) => {
          if (more.length > 0) {
            setQueue((prev) => {
              const ids = new Set(prev.map((t) => t.id));
              const fresh = more.filter((t) => !ids.has(t.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
        })
        .catch(() => {});
    }
    setCurrentIndex(nextIdx);
    await startTrackPlayback(queue[nextIdx]);
    if (nextIdx + 1 < queue.length) {
      api.prefetchTrack(queue[nextIdx + 1]).catch(() => {});
    }
  }, [queue, currentIndex, repeat, shuffle, activeWave, waveLoading, startTrackPlayback]);

  const handleStartWave = useCallback(
    async (source: WaveSource) => {
      setWaveSource(source);
      setWaveLoading(true);
      try {
        const waveTracks = await api.getWaveTracks(source);
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
          api.prefetchTrack(waveTracks[1]).catch(() => {});
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
      const liked = await api.toggleTrackLike(trackId);
      const patch = (arr: Track[]) =>
        arr.map((item) => (item.id === trackId ? { ...item, liked } : item));
      setTracks(patch);
      setPlaylistTracks(patch);
      setQueue(patch);
      if (searchResults) setSearchResults(patch(searchResults));
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const filteredLibraryTracks = useMemo(() => {
    if (selectedPlaylistId) return playlistTracks;
    if (sourceFilter === "all") return tracks;
    if (sourceFilter === "liked") return tracks.filter((item) => item.liked);
    return tracks.filter((item) => item.source === sourceFilter);
  }, [tracks, playlistTracks, selectedPlaylistId, sourceFilter]);

  const likedCount = useMemo(() => tracks.filter((item) => item.liked).length, [tracks]);
  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050507] text-[#F1F5F9] overflow-hidden relative">
      <div
        className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#050507] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          booting
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-[1.03] pointer-events-none"
        }`}
      >
        <div className="relative flex items-center justify-center">
          <span className="absolute w-24 h-24 rounded-full border border-cyanpulse/30 animate-ping" />
          <span className="absolute w-20 h-20 rounded-full bg-cyanpulse/15 blur-xl" />
          <AwaseLogo size={54} className="relative z-10" />
        </div>
        <div className="font-display text-sm tracking-[0.28em] text-slate-200 uppercase">
          AWASE
        </div>
        <div className="w-36 h-1 rounded-full bg-white/[0.08] overflow-hidden relative">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-transparent via-cyanpulse to-transparent animate-pulse" />
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
              queueOpen={queueOpen}
              eqOpen={eqOpen}
              gamingMode={preferences.gamingMode}
              waveSource={waveSource}
              activeWave={activeWave}
              waveLoading={waveLoading}
              onChangeWaveSource={setWaveSource}
              onStartWave={handleStartWave}
              onStopWave={() => setActiveWave(null)}
              onOpenLyrics={() => setLyricsOpen(true)}
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
              scanning={busySource === "local"}
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
                await api.clearLibrary();
                setQueue([]);
                setCurrentIndex(-1);
                await refreshLibrary();
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
              onOpenSpotifyLogin={(clientId) =>
                api.openSpotifyLoginBrowser(clientId).catch((e) => notify(String(e), "error"))
              }
              onConnectSpotify={async (clientId, token) => {
                setBusySource("spotify");
                try {
                  await api.connectSpotifyCredentials(clientId, token);
                  notify("Spotify updated");
                  await refreshLibrary();
                } catch (e) {
                  notify(String(e), "error");
                } finally {
                  setBusySource(null);
                }
              }}
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
              onOpenExternalUrl={(url) =>
                api.openExternalUrl(url).catch((e) => notify(String(e), "error"))
              }
            />
          )}
        </main>

        <QueueDrawer
          open={queueOpen}
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
          className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full border backdrop-blur-xl text-xs font-medium shadow-2xl awase-view-enter ${
            toast.tone === "error"
              ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
              : "bg-[#101217]/95 border-white/[0.15] text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      <PlayerDock
        language={preferences.language}
        currentTrack={currentTrack}
        telemetry={telemetry}
        coverPalette={coverPalette}
        shuffle={shuffle}
        repeat={repeat}
        queueOpen={queueOpen}
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
    </div>
  );
};
