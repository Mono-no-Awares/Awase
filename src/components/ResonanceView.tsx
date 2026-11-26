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
}) => {
  const t = TRANSLATIONS[language];
  const meta = currentTrack ? SOURCE_META[currentTrack.source] : SOURCE_META.local;
  const duration = telemetry.durationMs || currentTrack?.durationMs || 0;
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [openMenu, setOpenMenu] = useState<"wave" | "style" | null>(null);
  const [coverSrc, setCoverSrc] = useState<string | null>(currentTrack?.coverUrl ?? null);
  const menusRef = useRef<HTMLDivElement | null>(null);
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
  const activeWaveLabel =
    waveSources.find((w) => w.id === (activeWave ?? waveSource))?.label ?? "Yandex";

  const commitSeek = (val: number) => {
    setScrubMs(null);
    onSeek(val);
  };

  return (
    <div className="relative h-full min-h-[500px] rounded-3xl overflow-hidden border border-white/[0.08] bg-[#050507] flex flex-col justify-between p-6 awase-view-enter">
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

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
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

        <div ref={menusRef} className="relative flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === "wave" ? null : "wave"))}
              style={
                activeWave
                  ? {
                      borderColor: `${coverPalette.primary}66`,
                      boxShadow: `0 0 20px ${coverPalette.glow}`,
                    }
                  : undefined
              }
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#0E0F13]/90 border border-white/[0.12] backdrop-blur-xl text-xs font-medium text-white hover:bg-white/[0.08] transition-all cursor-pointer"
            >
              <span
                className={`w-2 h-2 rounded-full ${activeWave ? "animate-pulse" : "bg-slate-500"}`}
                style={activeWave ? { backgroundColor: coverPalette.primary } : undefined}
              />
              <span>{language === "ru" ? "Моя волна" : "My Wave"}</span>
              <span className="text-slate-400">·</span>
              <span className={activeWave ? "text-cyanpulse font-semibold" : "text-slate-400"}>
                {waveLoading
                  ? language === "ru"
                    ? "Подбор..."
                    : "Loading..."
                  : activeWave
                    ? language === "ru"
                      ? `Вкл (${activeWaveLabel})`
                      : `On (${activeWaveLabel})`
                    : language === "ru"
                      ? "Выкл"
                      : "Off"}
              </span>
              <IconChevronDown
                size={13}
                className={`text-slate-400 transition-transform duration-200 ${openMenu === "wave" ? "rotate-180" : ""}`}
              />
            </button>

            {openMenu === "wave" && (
              <div className="awase-menu-pop absolute right-0 mt-2 w-64 rounded-2xl bg-[#101217]/95 backdrop-blur-2xl border border-white/[0.14] shadow-[0_24px_48px_rgba(0,0,0,0.85)] p-2 z-30 space-y-2">
                <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
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
                            ? "bg-white/[0.12] text-white font-medium"
                            : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        <span>{src.label}</span>
                        {selected && <IconCheck size={14} className="text-cyanpulse" />}
                      </button>
                    );
                  })}
                </div>
                <div className="pt-1.5 border-t border-white/[0.08] flex gap-1.5">
                  <button
                    type="button"
                    disabled={waveLoading}
                    onClick={() => {
                      onStartWave(waveSource);
                      setOpenMenu(null);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyanpulse text-[#050507] text-xs font-semibold hover:opacity-95 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <IconResonance size={13} />
                    <span>
                      {activeWave
                        ? language === "ru"
                          ? "Обновить"
                          : "Refresh"
                        : language === "ru"
                          ? "Включить"
                          : "Start Wave"}
                    </span>
                  </button>
                  {activeWave && (
                    <button
                      type="button"
                      onClick={() => {
                        onStopWave();
                        setOpenMenu(null);
                      }}
                      className="py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-rose-500/20 text-xs font-medium text-slate-200 hover:text-rose-200 transition-all cursor-pointer"
                    >
                      {language === "ru" ? "Выкл" : "Stop"}
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
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#0E0F13]/90 border border-white/[0.12] backdrop-blur-xl text-xs font-medium text-white hover:bg-white/[0.08] transition-all cursor-pointer"
            >
              <span className="text-slate-400">
                {language === "ru" ? "Стиль" : "Style"}
              </span>
              <span className="text-slate-500">·</span>
              <span>{activeStyleLabel}</span>
              <IconChevronDown
                size={13}
                className={`text-slate-400 transition-transform duration-200 ${openMenu === "style" ? "rotate-180" : ""}`}
              />
            </button>

            {openMenu === "style" && (
              <div className="awase-menu-pop absolute right-0 mt-2 w-60 rounded-2xl bg-[#101217]/95 backdrop-blur-2xl border border-white/[0.14] shadow-[0_24px_48px_rgba(0,0,0,0.85)] p-2 z-30 space-y-1">
                <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {language === "ru" ? "Стиль визуализатора" : "Visualizer Style"}
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
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        selected
                          ? "bg-white/[0.12] text-white"
                          : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-medium">{s.label}</div>
                        <div className="text-[11px] text-slate-400">{s.desc}</div>
                      </div>
                      {selected && <IconCheck size={14} className="text-cyanpulse shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center my-auto py-3 pointer-events-none">
        <div
          className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-3xl overflow-hidden border border-white/20 bg-[#0A0B0E]/90 backdrop-blur-md flex items-center justify-center transition-all duration-700"
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

        <div className="mt-5 text-center max-w-xl px-4">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">
            {currentTrack ? currentTrack.title : t.notPlaying}
          </h2>
          <p className="text-sm text-slate-300 mt-1 truncate">
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
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              value={Math.min(displayPos, Math.max(1, duration))}
              onChange={(e) => setScrubMs(Number(e.target.value))}
              onMouseUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              aria-label="Seek timeline"
              className="awase-range w-full"
              style={{
                background: `linear-gradient(to right, ${coverPalette.primary} ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
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
