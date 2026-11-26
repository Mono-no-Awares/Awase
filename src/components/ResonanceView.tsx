import React, { useState } from "react";
import type {
  AppLanguage,
  AudioTelemetry,
  RepeatMode,
  Track,
  VisualizerStyle,
} from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { TRANSLATIONS } from "../lib/i18n";
import { formatDuration, SOURCE_META } from "../lib/sources";
import {
  IconEqualizer,
  IconHeart,
  IconMute,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconRepeat,
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
}) => {
  const t = TRANSLATIONS[language];
  const meta = currentTrack ? SOURCE_META[currentTrack.source] : SOURCE_META.local;
  const duration = telemetry.durationMs || currentTrack?.durationMs || 0;
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const displayPos = scrubMs ?? telemetry.positionMs;
  const progress = duration > 0 ? Math.min(100, (displayPos / duration) * 100) : 0;

  const styles: Array<{ id: VisualizerStyle; label: string }> = [
    { id: "aura", label: t.vizAura },
    { id: "silk", label: t.vizSilk },
    { id: "orbital", label: t.vizOrbital },
  ];

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

        <div className="flex items-center gap-1 p-1 rounded-full bg-[#0E0F13]/85 border border-white/[0.1] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectVisualizerStyle(s.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-250 cursor-pointer ${
                visualizerStyle === s.id
                  ? "bg-white text-[#050507] shadow-[0_2px_10px_rgba(255,255,255,0.22)]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
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
          {currentTrack?.coverUrl ? (
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
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
