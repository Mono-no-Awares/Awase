import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppLanguage,
  AudioTelemetry,
  LyricsPayload,
  RepeatMode,
  Track,
} from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { api } from "../lib/ipc";
import { TRANSLATIONS } from "../lib/i18n";
import { formatDuration, SOURCE_META } from "../lib/sources";
import {
  IconChevronDown,
  IconHeart,
  IconLyrics,
  IconMute,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconShuffle,
  IconVolume,
  SourceIcon,
} from "./AwaseIcons";

interface LyricsViewProps {
  open: boolean;
  language: AppLanguage;
  currentTrack: Track | null;
  telemetry: AudioTelemetry;
  coverPalette: CoverPalette;
  shuffle: boolean;
  repeat: RepeatMode;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (positionMs: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLike: (trackId: string) => void;
  onShareCard?: () => void;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  open,
  language,
  currentTrack,
  telemetry,
  coverPalette,
  shuffle,
  repeat,
  onClose,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
  onShareCard,
}) => {
  const t = TRANSLATIONS[language];
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [coverSrc, setCoverSrc] = useState<string | null>(currentTrack?.coverUrl ?? null);
  const [smoothPosMs, setSmoothPosMs] = useState(telemetry.positionMs);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const syncRef = useRef({ pos: telemetry.positionMs, ts: performance.now() });

  useEffect(() => {
    syncRef.current = { pos: telemetry.positionMs, ts: performance.now() };
    setSmoothPosMs(telemetry.positionMs);
  }, [telemetry.positionMs, currentTrack?.id]);

  useEffect(() => {
    if (!open || !telemetry.isPlaying || scrubMs !== null) return;
    let raf = 0;
    const tick = () => {
      const elapsed = Math.min(600, performance.now() - syncRef.current.ts);
      setSmoothPosMs(syncRef.current.pos + elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, telemetry.isPlaying, scrubMs]);

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
    if (!open || !currentTrack) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setLyrics(null);
    setOffsetMs(0);

    api
      .getTrackLyrics(currentTrack)
      .then((res) => {
        if (!cancelled) setLyrics(res);
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, currentTrack?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const songMsPerChar = useMemo(() => {
    if (!lyrics?.synced || lyrics.lines.length < 2) return 68;
    const rates: number[] = [];
    for (let i = 0; i < lyrics.lines.length - 1; i++) {
      const cur = lyrics.lines[i];
      const nxt = lyrics.lines[i + 1];
      if (cur.timeMs === null || nxt.timeMs === null) continue;
      const gap = nxt.timeMs - cur.timeMs;
      const len = cur.text.trim().length;
      if (len >= 8 && gap >= 700 && gap <= 5200) {
        rates.push(gap / len);
      }
    }
    if (rates.length === 0) return 68;
    rates.sort((a, b) => a - b);
    const median = rates[Math.floor(rates.length / 2)];
    return Math.min(105, Math.max(48, median * 0.88));
  }, [lyrics]);

  const effectivePos = (scrubMs ?? smoothPosMs) + offsetMs;

  const activeIdx = useMemo(() => {
    if (!lyrics?.synced || lyrics.lines.length === 0) return -1;
    let best = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      const tm = lyrics.lines[i].timeMs;
      if (tm !== null && tm <= effectivePos + 20) {
        best = i;
      }
    }
    return best;
  }, [lyrics, effectivePos]);

  useEffect(() => {
    if (!open || activeIdx < 0) return;
    const container = scrollContainerRef.current;
    const el = lineRefs.current[activeIdx];
    if (container && el) {
      const target = Math.max(
        0,
        el.offsetTop - container.clientHeight * 0.4 + el.clientHeight / 2
      );
      container.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [open, activeIdx]);

  const duration = telemetry.durationMs || currentTrack?.durationMs || 0;
  const displayPos = scrubMs ?? smoothPosMs;
  const progress = duration > 0 ? Math.min(100, (displayPos / duration) * 100) : 0;
  const meta = currentTrack ? SOURCE_META[currentTrack.source] : SOURCE_META.local;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#06070A] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
          : "opacity-0 translate-y-6 scale-[0.98] pointer-events-none"
      }`}
      style={{
        backgroundImage: `
          radial-gradient(circle at 22% 48%, ${coverPalette.glow}, transparent 56%),
          radial-gradient(circle at 76% 30%, ${coverPalette.secondary}26, transparent 54%),
          linear-gradient(155deg, ${coverPalette.primary}1C 0%, #07080C 52%, #050507 100%)
        `,
      }}
    >
      <div
        data-tauri-drag-region
        className="relative z-10 flex items-center justify-between px-8 pt-6 pb-2"
      >
        <button
          type="button"
          onClick={onClose}
          title={language === "ru" ? "Свернуть" : "Close"}
          className="w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] backdrop-blur-xl flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
        >
          <IconChevronDown size={16} />
        </button>

        <div className="flex items-center gap-2">
          {currentTrack && onShareCard && (
            <button
              type="button"
              onClick={onShareCard}
              title={language === "ru" ? "Скопировать карточку трека" : "Copy share card"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 hover:bg-white/[0.1] border border-white/[0.08] backdrop-blur-xl text-[11px] font-medium text-slate-200 hover:text-white transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="9" cy="9" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              <span>{language === "ru" ? "Карточка" : "Share"}</span>
            </button>
          )}
          {lyrics?.synced && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] backdrop-blur-xl text-[11px] font-medium text-white/75">
              <span className="text-white/50 tracking-wide">{lyrics.source}</span>
              <span className="text-white/20">·</span>
              <button
                type="button"
                onClick={() => setOffsetMs((o) => o - 250)}
                className="px-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                −
              </button>
              <span className="tabular-nums w-10 text-center text-white/90">
                {(offsetMs / 1000).toFixed(1)}s
              </span>
              <button
                type="button"
                onClick={() => setOffsetMs((o) => o + 250)}
                className="px-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[310px_1fr] lg:grid-cols-[350px_1fr] gap-10 lg:gap-20 px-8 md:px-14 lg:px-20 pb-8 items-center max-w-[1180px] w-full mx-auto">
        <div className="flex flex-col items-center w-full max-w-[350px] mx-auto gap-5">
          <div
            className="w-full aspect-square rounded-[24px] overflow-hidden ring-1 ring-white/[0.14] bg-[#0B0D12] flex items-center justify-center transition-all duration-700"
            style={{
              boxShadow: `0 32px 72px -14px ${coverPalette.glow}, 0 8px 24px -6px rgba(0,0,0,0.65)`,
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
              <SourceIcon source={meta.id} size={64} />
            )}
          </div>

          <div className="w-full flex items-center justify-between gap-4 pt-1">
            <div className="min-w-0">
              <h2 className="font-display text-[21px] font-bold tracking-tight text-white truncate leading-tight">
                {currentTrack ? currentTrack.title : t.notPlaying}
              </h2>
              <p className="text-[14px] font-medium text-white/60 truncate mt-1">
                {currentTrack ? currentTrack.artist : t.selectTrack}
              </p>
            </div>
            {currentTrack && (
              <button
                type="button"
                onClick={() => onToggleLike(currentTrack.id)}
                className={`w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.08] flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0 ${
                  currentTrack.liked ? "text-cyanpulse" : "text-white/75 hover:text-white"
                }`}
              >
                <IconHeart size={18} filled={currentTrack.liked} />
              </button>
            )}
          </div>

          <div className="w-full space-y-2">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={Math.min(displayPos, duration || 100)}
              onChange={(e) => setScrubMs(Number(e.target.value))}
              onMouseUp={(e) => {
                setScrubMs(null);
                onSeek(Number(e.currentTarget.value));
              }}
              onTouchEnd={(e) => {
                setScrubMs(null);
                onSeek(Number(e.currentTarget.value));
              }}
              aria-label="Seek"
              className="awase-range w-full"
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.92) ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
                height: "4px",
                borderRadius: "9999px",
              }}
            />
            <div className="flex justify-between text-[11px] font-medium text-white/45 tabular-nums">
              <span>{formatDuration(displayPos)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="w-full flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleShuffle}
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                shuffle ? "text-cyanpulse" : "text-white/55 hover:text-white"
              }`}
            >
              <IconShuffle size={18} />
            </button>
            <button
              type="button"
              onClick={onPrev}
              className="p-2 rounded-full text-white/80 hover:text-white transition-all active:scale-90 cursor-pointer"
            >
              <IconPrev size={22} />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-12 h-12 rounded-full bg-white text-[#050507] flex items-center justify-center shadow-[0_8px_24px_rgba(255,255,255,0.22)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              {telemetry.isPlaying ? <IconPause size={21} /> : <IconPlay size={21} />}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="p-2 rounded-full text-white/80 hover:text-white transition-all active:scale-90 cursor-pointer"
            >
              <IconNext size={22} />
            </button>
            <button
              type="button"
              onClick={onCycleRepeat}
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                repeat !== "off" ? "text-cyanpulse" : "text-white/55 hover:text-white"
              }`}
            >
              <IconRepeat size={18} one={repeat === "one"} />
            </button>
          </div>

          <div className="w-full flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onToggleMute}
              className="text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              {telemetry.muted || telemetry.volume === 0 ? (
                <IconMute size={16} />
              ) : (
                <IconVolume size={16} />
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
              className="awase-range flex-1"
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.85) ${(telemetry.muted ? 0 : telemetry.volume) * 100}%, rgba(255,255,255,0.2) ${(telemetry.muted ? 0 : telemetry.volume) * 100}%)`,
                height: "4px",
                borderRadius: "9999px",
              }}
            />
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="relative h-full max-h-[calc(100vh-110px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-2 flex flex-col justify-start"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 86%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 86%, transparent 100%)",
          }}
        >
          {!currentTrack ? (
            <div className="my-auto text-center text-white/45 text-sm">
              {t.selectTrack}
            </div>
          ) : loading ? (
            <div className="my-auto flex flex-col items-center gap-3 text-white/75">
              <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              <span className="text-xs tracking-wide uppercase text-white/50">
                {language === "ru" ? "Поиск текста песни..." : "Searching lyrics..."}
              </span>
            </div>
          ) : lyrics?.instrumental ? (
            <div className="my-auto text-center space-y-2">
              <IconLyrics size={32} className="mx-auto text-white/45" />
              <p className="text-lg font-medium text-white/85">
                {language === "ru" ? "Инструментальный трек" : "Instrumental track"}
              </p>
            </div>
          ) : errorMsg || !lyrics || lyrics.lines.length === 0 ? (
            <div className="my-auto text-center space-y-2">
              <IconLyrics size={32} className="mx-auto text-white/35" />
              <p className="text-base font-medium text-white/75">
                {language === "ru"
                  ? "Текст для этого трека не найден"
                  : "No lyrics found for this track"}
              </p>
              <p className="text-xs text-white/45">
                {currentTrack.artist} — {currentTrack.title}
              </p>
            </div>
          ) : (
            <div className="space-y-6 py-14">
              {lyrics.lines.map((line, idx) => {
                const isActive = lyrics.synced && idx === activeIdx;
                const dist = activeIdx >= 0 ? Math.abs(idx - activeIdx) : 0;

                const hasWordTimestamps = Boolean(isActive && line.words && line.words.length > 0);
                const tokens = isActive
                  ? hasWordTimestamps
                    ? line.words!.map((w) => w.text)
                    : line.text.split(/\s+/).filter(Boolean)
                  : [];

                let lineProgress = 0;
                const wordWeights = tokens.map((w) => {
                  const hasPause = /[,;:\u2014)\-]$/.test(w);
                  return w.length + 0.65 + (hasPause ? 1.8 : 0);
                });
                const totalWeight = wordWeights.reduce((a, b) => a + b, 0) || 1;

                if (isActive && line.timeMs !== null && !hasWordTimestamps) {
                  const nextTm = lyrics.lines[idx + 1]?.timeMs ?? null;
                  const naturalVocalDur = Math.max(700, totalWeight * songMsPerChar);
                  const gapMs =
                    nextTm !== null ? Math.max(500, nextTm - line.timeMs) : naturalVocalDur;
                  const vocalDurMs = Math.min(gapMs * 0.92, naturalVocalDur);
                  lineProgress = Math.min(
                    1,
                    Math.max(0, (effectivePos - line.timeMs) / vocalDurMs)
                  );
                }

                let accWeight = 0;

                const inactiveTone =
                  dist === 1
                    ? "text-white/45 hover:text-white/75"
                    : dist === 2
                      ? "text-white/25 hover:text-white/65"
                      : "text-white/15 blur-[0.35px] hover:blur-none hover:text-white/65";

                return (
                  <button
                    key={`${idx}-${line.timeMs ?? "p"}`}
                    ref={(el) => {
                      lineRefs.current[idx] = el;
                    }}
                    type="button"
                    onClick={() => {
                      if (line.timeMs !== null) {
                        const targetMs = Math.max(0, line.timeMs - offsetMs);
                        syncRef.current = { pos: targetMs, ts: performance.now() };
                        setSmoothPosMs(targetMs);
                        onSeek(targetMs);
                      }
                    }}
                    className={`block w-full text-left font-display text-[26px] sm:text-[30px] lg:text-[34px] font-bold leading-[1.3] tracking-[-0.02em] transition-all duration-300 ${
                      line.timeMs !== null ? "cursor-pointer" : "cursor-default"
                    } ${
                      lyrics.synced
                        ? isActive
                          ? "opacity-100"
                          : inactiveTone
                        : "text-white/85 hover:text-white"
                    }`}
                  >
                    {isActive && tokens.length > 0
                      ? tokens.map((word, wIdx) => {
                          let wPct = 0;
                          if (hasWordTimestamps && line.words) {
                            const wMeta = line.words[wIdx];
                            const nextWordStart = line.words[wIdx + 1]?.timeMs;
                            const fallbackDur = Math.max(180, word.length * songMsPerChar);
                            const wDur =
                              wMeta.durationMs ??
                              (nextWordStart && nextWordStart > wMeta.timeMs
                                ? nextWordStart - wMeta.timeMs
                                : fallbackDur);
                            wPct = Math.min(
                              100,
                              Math.max(0, ((effectivePos - wMeta.timeMs) / Math.max(120, wDur)) * 100)
                            );
                          } else {
                            const wStart = accWeight / totalWeight;
                            const wWeight = wordWeights[wIdx];
                            accWeight += wWeight;
                            const wEnd = accWeight / totalWeight;
                            wPct = Math.min(
                              100,
                              Math.max(0, ((lineProgress - wStart) / (wEnd - wStart)) * 100)
                            );
                          }

                          const wordStyle: React.CSSProperties =
                            wPct <= 0.5
                              ? { color: "rgba(255,255,255,0.36)" }
                              : wPct >= 99.5
                                ? {
                                    color: "#FFFFFF",
                                    filter: `drop-shadow(0 0 12px ${coverPalette.glow})`,
                                  }
                                : {
                                    backgroundImage: `linear-gradient(90deg, #FFFFFF ${Math.max(0, wPct - 8)}%, rgba(255,255,255,0.36) ${Math.min(100, wPct + 8)}%)`,
                                    WebkitBackgroundClip: "text",
                                    color: "transparent",
                                    filter: `drop-shadow(0 0 12px ${coverPalette.glow})`,
                                  };

                          return (
                            <span
                              key={wIdx}
                              className="inline-block mr-[0.28em]"
                              style={wordStyle}
                            >
                              {word}
                            </span>
                          );
                        })
                      : line.text}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
