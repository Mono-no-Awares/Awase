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

  return (
    <div
      className="h-screen w-screen bg-[#050507] text-white flex flex-col justify-between overflow-hidden select-none border border-white/[0.1]"
      style={{
        backgroundImage: `radial-gradient(circle at 12% 50%, ${coverPalette.glow}, transparent 58%)`,
      }}
    >
      <div
        data-tauri-drag-region
        className="flex-1 flex items-center justify-between gap-2.5 px-3 min-h-0"
      >
        <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            data-tauri-drag-region
            className="w-11 h-11 rounded-xl overflow-hidden bg-[#121318] border border-white/[0.12] shrink-0 flex items-center justify-center"
            style={{
              boxShadow: telemetry.isPlaying ? `0 0 18px -4px ${coverPalette.glow}` : "none",
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
              className="text-[11px] text-slate-300 truncate leading-tight mt-0.5"
            >
              {currentTrack
                ? currentTrack.artist
                : language === "ru"
                  ? "Нет активного трека"
                  : "Nothing playing"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
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

      <div className="h-[3px] w-full bg-white/[0.08] shrink-0">
        <div
          className="h-full transition-[width] duration-150 ease-out"
          style={{
            width: `${progress}%`,
            backgroundColor: coverPalette.primary,
          }}
        />
      </div>
    </div>
  );
};
