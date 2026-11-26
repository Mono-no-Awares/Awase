import React, { useState } from "react";
import type {
  AppLanguage,
  AudioTelemetry,
  MiniVisualizerMode,
  RepeatMode,
  Track,
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
  IconResonance,
  IconShuffle,
  IconVolume,
  SourceIcon,
} from "./AwaseIcons";
import { MiniSpectrumStrip } from "./VisualizerCanvas";

interface PlayerDockProps {
  language: AppLanguage;
  currentTrack: Track | null;
  telemetry: AudioTelemetry;
  coverPalette: CoverPalette;
  shuffle: boolean;
  repeat: RepeatMode;
  queueOpen: boolean;
  eqOpen: boolean;
  resonanceActive: boolean;
  miniVisualizer: MiniVisualizerMode;
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
  onToggleResonance: () => void;
}

export const PlayerDock: React.FC<PlayerDockProps> = ({
  language,
  currentTrack,
  telemetry,
  coverPalette,
  shuffle,
  repeat,
  queueOpen,
  eqOpen,
  resonanceActive,
  miniVisualizer,
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
  onToggleResonance,
}) => {
  const t = TRANSLATIONS[language];
  const sourceMeta = currentTrack
    ? SOURCE_META[currentTrack.source]
    : SOURCE_META.local;
  const duration = telemetry.durationMs || currentTrack?.durationMs || 0;
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const displayPos = scrubMs ?? telemetry.positionMs;
  const progress = duration > 0 ? Math.min(100, (displayPos / duration) * 100) : 0;

  const commitSeek = (val: number) => {
    setScrubMs(null);
    onSeek(val);
  };

  return (
    <footer
      className={`relative shrink-0 awase-glass px-5 flex items-center justify-between gap-4 z-30 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        resonanceActive
          ? "h-0 opacity-0 border-t-0 pointer-events-none"
          : "h-[94px] opacity-100 border-t border-white/[0.08]"
      }`}
    >
      <div className="absolute inset-x-0 bottom-0 h-11 opacity-35 pointer-events-none">
        <MiniSpectrumStrip
          spectrum={telemetry.spectrum}
          isPlaying={telemetry.isPlaying}
          accentColor={coverPalette.primary}
          mode={miniVisualizer}
          gamingMode={gamingMode}
        />
      </div>

      <div className="relative z-10 flex items-center gap-3.5 w-[29%] min-w-[220px]">
        <button
          type="button"
          onClick={onToggleResonance}
          className="relative w-[52px] h-[52px] rounded-xl overflow-hidden bg-[#14151B] border border-white/[0.08] shrink-0 group cursor-pointer transition-shadow duration-700"
          style={{
            boxShadow: telemetry.isPlaying
              ? `0 0 24px -6px ${coverPalette.glow}`
              : "none",
          }}
        >
          {currentTrack?.coverUrl ? (
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <SourceIcon source={sourceMeta.id} size={22} />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-white truncate">
            {currentTrack ? currentTrack.title : t.notPlaying}
          </div>
          <div className="text-xs text-slate-300 truncate">
            {currentTrack ? currentTrack.artist : t.selectTrack}
          </div>
        </div>

        {currentTrack && (
          <button
            type="button"
            onClick={() => onToggleLike(currentTrack.id)}
            aria-label="Like track"
            className={`p-2.5 rounded-full transition-all active:scale-95 cursor-pointer ${
              currentTrack.liked
                ? "text-cyanpulse bg-white/[0.09]"
                : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <IconHeart size={19} filled={currentTrack.liked} />
          </button>
        )}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-1 flex-1 max-w-2xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleShuffle}
            aria-label="Shuffle"
            className={`p-2 rounded-full transition-all active:scale-95 cursor-pointer ${
              shuffle
                ? "text-cyanpulse bg-white/[0.09]"
                : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <IconShuffle size={18} />
          </button>

          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous track"
            className="p-2 rounded-full text-slate-200 hover:text-white hover:bg-white/[0.08] transition-all active:scale-95 cursor-pointer"
          >
            <IconPrev size={20} />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={telemetry.isPlaying ? "Pause" : "Play"}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-[#050507] transition-transform active:scale-95 hover:scale-105 cursor-pointer"
          >
            {telemetry.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>

          <button
            type="button"
            onClick={onNext}
            aria-label="Next track"
            className="p-2 rounded-full text-slate-200 hover:text-white hover:bg-white/[0.08] transition-all active:scale-95 cursor-pointer"
          >
            <IconNext size={20} />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            aria-label="Repeat"
            className={`p-2 rounded-full transition-all active:scale-95 cursor-pointer ${
              repeat !== "off"
                ? "text-cyanpulse bg-white/[0.09]"
                : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <IconRepeat size={18} one={repeat === "one"} />
          </button>
        </div>

        <div className="w-full flex items-center gap-3">
          <span className="text-xs font-medium text-slate-300 tabular-nums w-10 text-right">
            {formatDuration(displayPos)}
          </span>
          <div className="relative flex-1 py-2 flex items-center">
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
                background: `linear-gradient(to right, ${coverPalette.primary} ${progress}%, rgba(255,255,255,0.22) ${progress}%)`,
                height: "6px",
                borderRadius: "9999px",
              }}
            />
          </div>
          <span className="text-xs font-medium text-slate-300 tabular-nums w-10">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-end gap-1.5 w-[27%] min-w-[210px]">
        <button
          type="button"
          onClick={onToggleResonance}
          title={t.waveTitle}
          aria-label={t.waveTitle}
          className={`p-2.5 rounded-full transition-all active:scale-95 cursor-pointer ${
            resonanceActive
              ? "text-cyanpulse bg-white/[0.1]"
              : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
          }`}
        >
          <IconResonance size={19} />
        </button>

        <button
          type="button"
          onClick={onToggleEq}
          title={t.eqTitle}
          aria-label={t.eqTitle}
          className={`p-2.5 rounded-full transition-all active:scale-95 cursor-pointer ${
            eqOpen
              ? "text-cyanpulse bg-white/[0.1]"
              : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
          }`}
        >
          <IconEqualizer size={19} />
        </button>

        <button
          type="button"
          onClick={onToggleQueue}
          title={t.queueTitle}
          aria-label={t.queueTitle}
          className={`p-2.5 rounded-full transition-all active:scale-95 cursor-pointer ${
            queueOpen
              ? "text-cyanpulse bg-white/[0.1]"
              : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
          }`}
        >
          <IconQueue size={19} />
        </button>

        <div className="flex items-center gap-2 pl-2">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={telemetry.muted ? "Unmute" : "Mute"}
            className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {telemetry.muted || telemetry.volume === 0 ? (
              <IconMute size={19} />
            ) : (
              <IconVolume size={19} />
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
            className="awase-range w-24"
            style={{
              background: `linear-gradient(to right, ${coverPalette.primary} ${(telemetry.muted ? 0 : telemetry.volume) * 100}%, rgba(255,255,255,0.22) ${(telemetry.muted ? 0 : telemetry.volume) * 100}%)`,
              height: "6px",
              borderRadius: "9999px",
            }}
          />
        </div>
      </div>
    </footer>
  );
};
