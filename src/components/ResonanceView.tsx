import React, { useEffect, useRef, useState } from "react";
import type {
  AppLanguage,
  AudioTelemetry,
  RepeatMode,
  Track,
  VisualizerStyle,
  WaveSource,
} from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { TRANSLATIONS } from "../lib/i18n";
import { api } from "../lib/ipc";
import { formatDuration, SOURCE_META } from "../lib/sources";
import {
  IconCheck,
  IconChevronDown,
  IconEqualizer,
  IconHeart,
  IconLyrics,
  IconMute,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconRepeat,
  IconResonance,
  IconShuffle,
  IconVolume,
  SourceIcon,
} from "./AwaseIcons";
import { VisualizerCanvas } from "./VisualizerCanvas";

interface ResonanceViewProps {
  language: AppLanguage;
  currentTrack: Track | null;
  telemetry: AudioTelemetry;
  coverPalette: CoverPalette;
  visualizerStyle: VisualizerStyle;
  onSelectVisualizerStyle: (style: VisualizerStyle) => void;
  shuffle: boolean;
  repeat: RepeatMode;
  queueOpen: boolean;
  eqOpen: boolean;
  gamingMode?: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (positionMs: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: (trackId: string) => void;
  onToggleQueue: () => void;
  onToggleEq: () => void;
  waveSource: WaveSource;
  activeWave: WaveSource | null;
  waveLoading: boolean;
  onChangeWaveSource: (src: WaveSource) => void;
  onStartWave: (src: WaveSource) => void;
  onStopWave: () => void;
  onDislikeWave?: () => void;
  onOpenLyrics: () => void;
  onShareCard?: () => void;
}

export const ResonanceView: React.FC<ResonanceViewProps> = ({
  language,
  currentTrack,
  telemetry,
  coverPalette,
  visualizerStyle,
  onSelectVisualizerStyle,
  shuffle,
  repeat,
  queueOpen,
  eqOpen,
  gamingMode = false,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onToggleQueue,
  onToggleEq,
  waveSource,
  activeWave,
  waveLoading,
  onChangeWaveSource,
  onStartWave,
  onStopWave,
  onDislikeWave,
  onOpenLyrics,
  onShareCard,
}) => {
  const t = TRANSLATIONS[language];
  const meta = currentTrack ? SOURCE_META[currentTrack.source] : SOURCE_META.local;
  const duration = telemetry.durationMs || currentTrack?.durationMs || 0;
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const seekHoldRef = useRef<{ target: number; until: number } | null>(null);
  const [openMenu, setOpenMenu] = useState<"wave" | "style" | null>(null);
  const [coverSrc, setCoverSrc] = useState<string | null>(currentTrack?.coverUrl ?? null);
  const menusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const hold = seekHoldRef.current;
    if (!hold) return;
    if (
      performance.now() >= hold.until ||
      Math.abs(telemetry.positionMs - hold.target) < 1100
    ) {
      seekHoldRef.current = null;
      if (!isScrubbing) setScrubMs(null);
    }
  }, [telemetry.positionMs, isScrubbing]);

  const displayPos = scrubMs ?? telemetry.positionMs;
  const progress = duration > 0 ? Math.min(100, (displayPos / duration) * 100) : 0;

  useEffect(() => {
    const raw = currentTrack?.coverUrl ?? null;
    setCoverSrc(raw);
    if (raw && raw.includes("sndcdn.com")) {
      let cancelled = false;
      api
        .fetchCoverCached(raw)
        .then((dataUrl) => {
          if (!cancelled) setCoverSrc(dataUrl);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [currentTrack?.id, currentTrack?.coverUrl]);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menusRef.current && !menusRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const styles: Array<{ id: VisualizerStyle; label: string; desc: string }> = [
    {
      id: "aura",
      label: t.vizAura,
      desc: language === "ru" ? "Пульсирующие кольца" : "Reactive halo rings",
    },
    {
      id: "silk",
      label: t.vizSilk,
      desc: language === "ru" ? "Плавные шёлковые линии" : "Flowing silk waves",
    },
    {
      id: "orbital",
      label: t.vizOrbital,
      desc: language === "ru" ? "Орбитальные частицы" : "Orbital particle field",
    },
  ];

  const waveSources: Array<{ id: WaveSource; label: string }> = [
    { id: "yandex", label: language === "ru" ? "Яндекс Музыка" : "Yandex Music" },
    { id: "soundcloud", label: "SoundCloud" },
    { id: "mix", label: language === "ru" ? "Микс (оба)" : "Mix (Both)" },
  ];

  const activeStyleLabel = styles.find((s) => s.id === visualizerStyle)?.label ?? t.vizAura;

  const commitSeek = (val: number) => {
    setIsScrubbing(false);
    setScrubMs(val);
    seekHoldRef.current = { target: val, until: performance.now() + 650 };
    onSeek(val);
  };

  return (
    <div className="relative isolate h-full min-h-[500px] rounded-3xl overflow-hidden border border-white/[0.08] bg-[#050507] flex flex-col justify-between p-6 awase-view-enter">
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${coverPalette.glow}, transparent 64%)`,
          opacity: telemetry.isPlaying ? 0.78 : 0.28,
        }}
      />

      <div className="absolute inset-0 pointer-events-none">
        <VisualizerCanvas
          styleMode={visualizerStyle}
          spectrum={telemetry.spectrum}
          peak={telemetry.peak}
          isPlaying={telemetry.isPlaying}
          accentColor={coverPalette.primary}
          secondaryColor={coverPalette.secondary}
          gamingMode={gamingMode}
        />
      </div>

      <div className="relative z-30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 px-1">
          <span
            className="w-2 h-2 rounded-full transition-colors duration-500"
            style={{
              backgroundColor: coverPalette.primary,
              boxShadow: telemetry.isPlaying ? `0 0 10px ${coverPalette.primary}` : "none",
            }}
          />
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
            {t.waveTitle}
          </span>
        </div>

        <div
          ref={menusRef}
          className="relative flex items-center gap-1 p-1 rounded-full bg-black/45 border border-white/[0.08] backdrop-blur-xl shadow-[0_10px_32px_rgba(0,0,0,0.45)]"
        >
          {currentTrack && onShareCard && (
            <button
              type="button"
              onClick={onShareCard}
              title={language === "ru" ? "Скопировать карточку трека" : "Copy share card"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="9" cy="9" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              <span>{language === "ru" ? "Карточка" : "Share"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenLyrics}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <IconLyrics size={14} className="text-slate-400" />
            <span>{language === "ru" ? "Текст" : "Lyrics"}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === "wave" ? null : "wave"))}
              style={
                activeWave
                  ? {
                      backgroundColor: `${coverPalette.primary}1A`,
                      boxShadow: `0 0 18px -4px ${coverPalette.glow}`,
                    }
                  : undefined
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 cursor-pointer ${
                activeWave || openMenu === "wave"
                  ? "bg-white/[0.1] text-white"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <IconResonance
                size={14}
                className={activeWave ? "text-cyanpulse" : "text-slate-400"}
              />
              <span>{language === "ru" ? "Моя волна" : "My Wave"}</span>
              {activeWave && (
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: coverPalette.primary }}
                />
              )}
              <IconChevronDown
                size={12}
                className={`text-slate-400 transition-transform duration-200 ${openMenu === "wave" ? "rotate-180" : ""}`}
              />
            </button>

            {openMenu === "wave" && (
              <div className="awase-menu-pop absolute right-0 mt-2.5 w-64 max-h-[calc(100vh-190px)] overflow-y-auto awase-scroll rounded-2xl awase-glass border border-white/[0.1] ring-1 ring-white/[0.04] shadow-[0_22px_56px_rgba(0,0,0,0.88)] p-2 z-50 space-y-1.5">
                <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400/90">
                  {language === "ru" ? "Источник волны" : "Wave Source"}
                </div>
                <div className="space-y-1">
                  {waveSources.map((src) => {
                    const selected = waveSource === src.id;
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => onChangeWaveSource(src.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                          selected
                            ? "bg-white/[0.1] text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        <span>{src.label}</span>
                        {selected && <IconCheck size={13} className="text-cyanpulse" />}
                      </button>
                    );
                  })}
                </div>
                <div className="pt-2 border-t border-white/[0.07] flex gap-1.5">
                  <button
                    type="button"
                    disabled={waveLoading}
                    onClick={() => {
                      onStartWave(waveSource);
                      setOpenMenu(null);
                    }}
                    style={{
                      backgroundColor: `${coverPalette.primary}24`,
                      borderColor: `${coverPalette.primary}55`,
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium text-white hover:brightness-125 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <span style={{ color: coverPalette.primary }}>
                      <IconPlay size={12} />
                    </span>
                    <span>
                      {waveLoading
                        ? language === "ru"
                          ? "Подбор..."
                          : "Loading..."
                        : activeWave
                          ? language === "ru"
                            ? "Обновить"
                            : "Refresh"
                          : language === "ru"
                            ? "Запустить"
                            : "Start"}
                    </span>
                  </button>
                  {activeWave && (
                    <button
                      type="button"
                      onClick={() => {
                        onStopWave();
                        setOpenMenu(null);
                      }}
                      className="py-2 px-3 rounded-xl bg-white/[0.07] hover:bg-rose-500/20 text-xs font-medium text-slate-300 hover:text-rose-200 transition-all cursor-pointer"
                    >
                      {language === "ru" ? "Стоп" : "Stop"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === "style" ? null : "style"))}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 cursor-pointer ${
                openMenu === "style"
                  ? "bg-white/[0.1] text-white"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: coverPalette.primary }}
              />
              <span>{activeStyleLabel}</span>
              <IconChevronDown
                size={12}
                className={`text-slate-400 transition-transform duration-200 ${openMenu === "style" ? "rotate-180" : ""}`}
              />
            </button>

            {openMenu === "style" && (
              <div className="awase-menu-pop absolute right-0 mt-2.5 w-60 max-h-[calc(100vh-190px)] overflow-y-auto awase-scroll rounded-2xl awase-glass border border-white/[0.1] ring-1 ring-white/[0.04] shadow-[0_22px_56px_rgba(0,0,0,0.88)] p-2 z-50 space-y-1">
                <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400/90">
                  {language === "ru" ? "Стиль визуализации" : "Visualizer Style"}
                </div>
                {styles.map((s) => {
                  const selected = visualizerStyle === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onSelectVisualizerStyle(s.id);
                        setOpenMenu(null);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        selected
                          ? "bg-white/[0.1] text-white"
                          : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-medium">{s.label}</div>
                        <div className="text-[11px] text-slate-400">{s.desc}</div>
                      </div>
                      {selected && <IconCheck size={13} className="text-cyanpulse shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 grid grid-rows-[1fr_auto_1fr] items-center justify-items-center pointer-events-none">
        <div />
        <div
          className="relative w-[clamp(136px,24vmin,216px)] h-[clamp(136px,24vmin,216px)] rounded-3xl overflow-hidden border border-white/20 bg-[#0A0B0E] flex items-center justify-center transition-transform duration-500"
          style={{
            boxShadow: `0 24px 64px -10px ${coverPalette.glow}`,
            transform: telemetry.isPlaying ? `scale(${1 + telemetry.peak * 0.04})` : "scale(1)",
          }}
        >
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              onError={() => {
                if (coverSrc.includes("-t500x500")) {
                  setCoverSrc(coverSrc.replace("-t500x500", "-large"));
                } else {
                  setCoverSrc(null);
                }
              }}
              className="w-full h-full object-cover"
            />
          ) : (
            <SourceIcon source={meta.id} size={54} />
          )}
        </div>

        <div className="self-start pt-4 text-center max-w-xl px-4">
          <h2 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight truncate">
            {currentTrack ? currentTrack.title : t.notPlaying}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 truncate">
            {currentTrack
              ? `${currentTrack.artist}${currentTrack.album ? ` · ${currentTrack.album}` : ""}`
              : t.waveStandby}
          </p>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-auto rounded-2xl bg-[#0A0B0E]/80 backdrop-blur-xl border border-white/[0.1] px-5 py-3.5 space-y-2.5">
        <div className="w-full flex items-center gap-3">
          <span className="text-xs font-medium text-slate-300 tabular-nums w-10 text-right">
            {formatDuration(displayPos)}
          </span>
          <div className="relative flex-1 py-1.5 flex items-center">
            <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/[0.16] overflow-hidden pointer-events-none">
              <div
                className={`h-full rounded-full ${
                  isScrubbing ? "transition-none" : "transition-[width] duration-150 ease-out"
                }`}
                style={{
                  width: `${progress}%`,
                  backgroundColor: coverPalette.primary,
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              value={Math.min(displayPos, Math.max(1, duration))}
              onPointerDown={() => setIsScrubbing(true)}
              onChange={(e) => {
                setIsScrubbing(true);
                setScrubMs(Number(e.target.value));
              }}
              onPointerUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              onMouseUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              aria-label="Seek timeline"
              className="awase-range relative z-10 w-full bg-transparent"
              style={{
                background: "transparent",
                height: "6px",
                borderRadius: "9999px",
              }}
            />
          </div>
          <span className="text-xs font-medium text-slate-300 tabular-nums w-10">
            {formatDuration(duration)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 min-w-[110px]">
            {currentTrack && (
              <button
                type="button"
                onClick={() => onToggleLike(currentTrack.id)}
                aria-label="Like track"
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  currentTrack.liked
                    ? "text-cyanpulse bg-white/[0.1]"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                <IconHeart size={18} filled={currentTrack.liked} />
              </button>
            )}
            {activeWave && currentTrack && onDislikeWave && (
              <button
                type="button"
                onClick={onDislikeWave}
                title={language === "ru" ? "Не нравится (пропустить)" : "Dislike (skip)"}
                aria-label="Dislike track"
                className="p-2 rounded-full text-slate-300 hover:text-rose-300 hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 14V2" />
                  <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleEq}
              title={t.eqTitle}
              aria-label={t.eqTitle}
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                eqOpen
                  ? "text-cyanpulse bg-white/[0.1]"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <IconEqualizer size={18} />
            </button>
            {!activeWave && (
              <button
                type="button"
                onClick={onToggleQueue}
                title={t.queueTitle}
                aria-label={t.queueTitle}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  queueOpen
                    ? "text-cyanpulse bg-white/[0.1]"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                <IconQueue size={18} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleShuffle}
              aria-label="Shuffle"
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                shuffle
                  ? "text-cyanpulse bg-white/[0.1]"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <IconShuffle size={17} />
            </button>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous track"
              className="p-2 rounded-full text-slate-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <IconPrev size={20} />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={telemetry.isPlaying ? "Pause" : "Play"}
              className="w-11 h-11 rounded-full flex items-center justify-center bg-white text-[#050507] transition-transform active:scale-95 hover:scale-105 cursor-pointer"
            >
              {telemetry.isPlaying ? <IconPause size={19} /> : <IconPlay size={19} />}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next track"
              className="p-2 rounded-full text-slate-200 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <IconNext size={20} />
            </button>
            <button
              type="button"
              onClick={onCycleRepeat}
              aria-label="Repeat"
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                repeat !== "off"
                  ? "text-cyanpulse bg-white/[0.1]"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <IconRepeat size={17} one={repeat === "one"} />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 min-w-[110px]">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={telemetry.muted ? "Unmute" : "Mute"}
              className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {telemetry.muted || telemetry.volume === 0 ? (
                <IconMute size={18} />
              ) : (
                <IconVolume size={18} />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={telemetry.muted ? 0 : telemetry.volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volume"
              className="awase-range w-20"
              style={{
                background: `linear-gradient(to right, ${coverPalette.primary} ${(telemetry.muted ? 0 : telemetry.volume) * 100}%, rgba(255,255,255,0.2) ${(telemetry.muted ? 0 : telemetry.volume) * 100}%)`,
                height: "5px",
                borderRadius: "9999px",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
