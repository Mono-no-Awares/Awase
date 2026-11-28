import React, { useEffect, useState } from "react";
import type { AppLanguage, AudioTelemetry, Track } from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { api } from "../lib/ipc";
import { SOURCE_META } from "../lib/sources";
import {
  IconHeart,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  SourceIcon,
} from "./AwaseIcons";

interface MiniPlayerProps {
  language: AppLanguage;
  currentTrack: Track | null;
  telemetry: AudioTelemetry;
  coverPalette: CoverPalette;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleLike: (trackId: string) => void;
  onExpand: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  language,
  currentTrack,
  telemetry,
  coverPalette,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleLike,
  onExpand,
}) => {
  const [coverSrc, setCoverSrc] = useState<string | null>(currentTrack?.coverUrl ?? null);
  const [hovered, setHovered] = useState(false);
  const meta = currentTrack ? SOURCE_META[currentTrack.source] : SOURCE_META.local;
  const duration = telemetry.durationMs || currentTrack?.durationMs || 0;
  const progress = duration > 0 ? Math.min(100, (telemetry.positionMs / duration) * 100) : 0;

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

  const bars = [0, 2, 5, 9, 13].map((idx) => {
    const v = telemetry.spectrum[idx] ?? 0;
    return telemetry.isPlaying ? Math.max(0.18, Math.min(1, v * 1.25 + telemetry.peak * 0.25)) : 0.16;
  });

  const edgeIntensity = telemetry.isPlaying ? 0.45 + telemetry.peak * 0.55 : 0.15;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative h-screen w-screen bg-[#050507] text-white flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundImage: `
          radial-gradient(circle at 14% 50%, ${coverPalette.glow}, transparent 52%),
          radial-gradient(circle at 88% 50%, ${coverPalette.secondary}26, transparent 52%)
        `,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 -2px 18px -2px ${coverPalette.primary}${Math.round(
          edgeIntensity * 140
        )
          .toString(16)
          .padStart(2, "0")}`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${coverPalette.primary}, ${coverPalette.secondary}, transparent)`,
          opacity: edgeIntensity,
        }}
      />

      <div
        data-tauri-drag-region
        className="flex-1 flex items-center justify-between gap-3 px-3.5 min-h-0"
      >
        <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            data-tauri-drag-region
            className="w-11 h-11 rounded-full overflow-hidden bg-[#121318] border border-white/[0.16] shrink-0 flex items-center justify-center transition-transform duration-300"
            style={{
              boxShadow: telemetry.isPlaying ? `0 0 20px -2px ${coverPalette.glow}` : "none",
              transform: telemetry.isPlaying ? `scale(${1 + telemetry.peak * 0.06})` : "scale(1)",
            }}
          >
            {coverSrc ? (
              <img
                src={coverSrc}
                alt=""
                onError={() => setCoverSrc(null)}
                className="w-full h-full object-cover pointer-events-none"
              />
            ) : (
              <SourceIcon source={meta.id} size={18} />
            )}
          </div>
          <div data-tauri-drag-region className="min-w-0 flex-1">
            <div
              data-tauri-drag-region
              className="text-xs font-semibold text-white truncate leading-tight"
            >
              {currentTrack ? currentTrack.title : "Awase"}
            </div>
            <div
              data-tauri-drag-region
              className="text-[11px] text-slate-300/85 truncate leading-tight mt-0.5"
            >
              {currentTrack
                ? currentTrack.artist
                : language === "ru"
                  ? "Нет активного трека"
                  : "Nothing playing"}
            </div>
          </div>
        </div>

        <div className="relative flex items-center shrink-0">
          <div
            data-tauri-drag-region
            className={`flex items-end gap-[3px] h-5 px-2 transition-all duration-200 ${
              hovered || !telemetry.isPlaying ? "opacity-0 scale-90 pointer-events-none w-0 px-0 overflow-hidden" : "opacity-100 scale-100"
            }`}
          >
            {bars.map((h, idx) => (
              <span
                key={idx}
                className="w-[3px] rounded-full transition-[height] duration-75"
                style={{
                  height: `${Math.round(h * 100)}%`,
                  backgroundColor: idx % 2 === 0 ? coverPalette.primary : coverPalette.secondary,
                  boxShadow: `0 0 8px ${coverPalette.glow}`,
                }}
              />
            ))}
          </div>

          <div
            className={`flex items-center gap-0.5 transition-all duration-200 ${
              hovered || !telemetry.isPlaying
                ? "opacity-100 scale-100"
                : "opacity-0 scale-90 pointer-events-none w-0 overflow-hidden"
            }`}
          >
            {currentTrack && (
              <button
                type="button"
                onClick={() => onToggleLike(currentTrack.id)}
                aria-label="Like"
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  currentTrack.liked
                    ? "text-cyanpulse"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                <IconHeart size={14} filled={currentTrack.liked} />
              </button>
            )}
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous"
              className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <IconPrev size={15} />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={telemetry.isPlaying ? "Pause" : "Play"}
              className="w-8 h-8 rounded-full bg-white text-[#050507] flex items-center justify-center hover:brightness-95 active:scale-95 transition-all cursor-pointer mx-0.5"
            >
              {telemetry.isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next"
              className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <IconNext size={15} />
            </button>
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand window"
              className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer ml-0.5"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="relative h-[3px] w-full bg-white/[0.08] shrink-0">
        <div
          className="h-full transition-[width] duration-150 ease-out"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${coverPalette.primary}, ${coverPalette.secondary})`,
            boxShadow: `0 0 12px ${coverPalette.primary}`,
          }}
        />
      </div>
    </div>
  );
};
