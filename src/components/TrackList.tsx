import React, { useEffect, useRef, useState } from "react";
import type { AppLanguage, Playlist, Track } from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { TRANSLATIONS } from "../lib/i18n";
import { formatDuration } from "../lib/sources";
import {
  IconCheck,
  IconHeart,
  IconLibrary,
  IconMinus,
  IconPlay,
  IconPlaylistAdd,
  IconPlus,
  SourceIcon,
} from "./AwaseIcons";

export type SortField = "added" | "title" | "album" | "duration";
export type SortDir = "asc" | "desc";

interface TrackListProps {
  language: AppLanguage;
  tracks: Track[];
  currentTrackId: string | null;
  isPlaying: boolean;
  coverPalette: CoverPalette;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onToggleLike: (trackId: string) => void;
  onQueueTrack: (track: Track) => void;
  playlists?: Playlist[];
  onAddToPlaylist?: (playlistId: string, track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  sortField?: SortField;
  sortDir?: SortDir;
  onChangeSort?: (field: SortField) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (trackId: string) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export const TrackList: React.FC<TrackListProps> = ({
  language,
  tracks,
  currentTrackId,
  isPlaying,
  coverPalette,
  onPlayTrack,
  onToggleLike,
  onQueueTrack,
  playlists = [],
  onAddToPlaylist,
  onRemoveFromPlaylist,
  sortField,
  sortDir,
  onChangeSort,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  emptyTitle,
  emptySubtitle,
}) => {
  const t = TRANSLATIONS[language];
  const [menuTrackId, setMenuTrackId] = useState<string | null>(null);
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const [winRange, setWinRange] = useState<{ start: number; end: number }>({ start: 0, end: 50 });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const ROW_H = 60;
  const virtualize = tracks.length > 60;

  useEffect(() => {
    if (!virtualize) {
      setWinRange({ start: 0, end: tracks.length });
      return;
    }
    const listEl = listRef.current;
    const scrollEl = listEl?.closest("main");
    if (!scrollEl || !listEl) return;

    let raf = 0;
    const recalc = () => {
      raf = 0;
      const listTop = listEl.offsetTop;
      const relTop = Math.max(0, scrollEl.scrollTop - listTop);
      const viewH = scrollEl.clientHeight || 700;
      const start = Math.max(0, Math.floor(relTop / ROW_H) - 10);
      const end = Math.min(tracks.length, Math.ceil((relTop + viewH) / ROW_H) + 12);
      setWinRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(recalc);
    };

    recalc();
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollEl.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [tracks.length, virtualize]);

  useEffect(() => {
    if (!menuTrackId) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuTrackId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuTrackId(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuTrackId]);

  if (tracks.length === 0) {
    return (
      <div className="awase-card rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-2.5">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-slate-200 mb-1">
          <IconPlay size={20} />
        </div>
        <h3 className="font-display text-sm font-semibold text-white">
          {emptyTitle ?? t.emptyLibraryTitle}
        </h3>
        <p className="text-xs text-slate-400 max-w-md">
          {emptySubtitle ?? t.emptyLibrarySubtitle}
        </p>
      </div>
    );
  }

  const arrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const startIdx = virtualize ? winRange.start : 0;
  const endIdx = virtualize ? winRange.end : tracks.length;
  const topPad = startIdx * ROW_H;
  const bottomPad = Math.max(0, (tracks.length - endIdx) * ROW_H);

  return (
    <div ref={listRef} className="awase-card rounded-2xl overflow-visible">
      <div className="grid grid-cols-[44px_minmax(220px,2fr)_minmax(140px,1.2fr)_124px_64px] items-center px-4 py-2.5 border-b border-white/[0.07] text-xs font-medium text-slate-400">
        <button
          type="button"
          onClick={() => onChangeSort?.("added")}
          className="text-left hover:text-white transition-colors cursor-pointer"
        >
          #{arrow("added")}
        </button>
        <button
          type="button"
          onClick={() => onChangeSort?.("title")}
          className="text-left hover:text-white transition-colors cursor-pointer"
        >
          {t.colTitle}
          {arrow("title")}
        </button>
        <button
          type="button"
          onClick={() => onChangeSort?.("album")}
          className="hidden md:block text-left hover:text-white transition-colors cursor-pointer"
        >
          {t.colAlbum}
          {arrow("album")}
        </button>
        <span className="text-right pr-2">{t.colActions}</span>
        <button
          type="button"
          onClick={() => onChangeSort?.("duration")}
          className="text-right hover:text-white transition-colors cursor-pointer"
        >
          {t.colDuration}
          {arrow("duration")}
        </button>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {topPad > 0 && <div style={{ height: topPad }} />}
        {tracks.slice(startIdx, endIdx).map((track, localIdx) => {
          const idx = startIdx + localIdx;
          const active = track.id === currentTrackId;
          const isSelected = selectedIds?.has(track.id) ?? false;

          return (
            <div
              key={track.id}
              onClick={() => {
                if (selectMode && onToggleSelect) {
                  onToggleSelect(track.id);
                } else {
                  onPlayTrack(track, tracks);
                }
              }}
              style={{ height: ROW_H }}
              className={`awase-track-row group grid grid-cols-[44px_minmax(220px,2fr)_minmax(140px,1.2fr)_124px_64px] items-center px-4 text-xs transition-colors duration-150 last:rounded-b-2xl cursor-pointer ${
                isSelected
                  ? "bg-cyanpulse/12"
                  : active
                    ? "bg-white/[0.07]"
                    : "hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center">
                {selectMode ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect?.(track.id);
                    }}
                    aria-label="Select track"
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "bg-cyanpulse border-cyanpulse text-[#050507] scale-100 shadow-sm"
                        : "bg-white/[0.04] border-white/[0.22] text-transparent hover:border-white/[0.45] scale-95"
                    }`}
                  >
                    <IconCheck size={12} />
                  </button>
                ) : active && isPlaying ? (
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <span
                      className="absolute w-4 h-4 rounded-full opacity-35 animate-ping"
                      style={{ backgroundColor: coverPalette.primary }}
                    />
                    <span
                      className="relative w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: coverPalette.primary,
                        boxShadow: `0 0 10px ${coverPalette.primary}`,
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <span className="group-hover:hidden text-xs text-slate-400 tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="hidden group-hover:inline-flex text-white">
                      <IconPlay size={14} />
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 min-w-0 pr-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-[#101217] border border-white/[0.08] flex items-center justify-center">
                  {track.coverUrl ? (
                    <img
                      src={track.coverUrl}
                      alt={track.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <SourceIcon source={track.source} size={20} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className="font-medium text-[13px] truncate transition-colors"
                    style={active ? { color: coverPalette.primary } : { color: "#FFFFFF" }}
                  >
                    {track.title}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 truncate mt-0.5">
                    <SourceIcon source={track.source} size={14} className="shrink-0" />
                    <span className="truncate">{track.artist || "Unknown Artist"}</span>
                  </div>
                </div>
              </div>

              <div className="hidden md:block text-xs text-slate-400 truncate pr-3">
                {track.album || "—"}
              </div>

              <div className="flex items-center justify-end gap-1 w-[124px] pr-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLike(track.id);
                  }}
                  aria-label="Toggle favorite"
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 cursor-pointer ${
                    track.liked
                      ? "text-cyanpulse"
                      : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/[0.09]"
                  }`}
                >
                  <IconHeart size={16} filled={track.liked} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQueueTrack(track);
                  }}
                  title="Add to queue"
                  aria-label="Add to queue"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-300 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/[0.09] transition-all active:scale-90 cursor-pointer"
                >
                  <IconPlus size={16} />
                </button>

                <div
                  className="relative w-8 flex items-center justify-center"
                  ref={menuTrackId === track.id ? menuRef : undefined}
                >
                  {onRemoveFromPlaylist ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFromPlaylist(track);
                      }}
                      title={t.removeFromPlaylist}
                      aria-label={t.removeFromPlaylist}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/15 transition-all active:scale-90 cursor-pointer"
                    >
                      <IconMinus size={16} />
                    </button>
                  ) : (
                    playlists.length > 0 &&
                    onAddToPlaylist && (
                      <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuTrackId((prev) => (prev === track.id ? null : track.id));
                        }}
                        title={t.addToPlaylist}
                        aria-label={t.addToPlaylist}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 cursor-pointer ${
                          menuTrackId === track.id
                            ? "opacity-100 bg-white/[0.14] text-white border border-white/[0.15]"
                            : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/[0.09]"
                        }`}
                      >
                        <IconPlaylistAdd size={16} />
                      </button>

                      {menuTrackId === track.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="awase-menu-pop absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl awase-glass border border-white/[0.14] shadow-[0_24px_48px_rgba(0,0,0,0.7)] overflow-hidden"
                        >
                          <div className="px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 border-b border-white/[0.07]">
                            {t.addToPlaylist}
                          </div>
                          <div className="max-h-56 overflow-y-auto awase-scroll p-1.5 space-y-0.5">
                            {playlists.map((pl) => {
                              const justAdded = addedKey === `${track.id}:${pl.id}`;
                              return (
                                <button
                                  key={pl.id}
                                  type="button"
                                  onClick={() => {
                                    onAddToPlaylist(pl.id, track);
                                    setAddedKey(`${track.id}:${pl.id}`);
                                    window.setTimeout(() => {
                                      setAddedKey(null);
                                      setMenuTrackId(null);
                                    }, 320);
                                  }}
                                  className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs text-slate-200 hover:text-white hover:bg-white/[0.09] transition-all active:scale-[0.98] cursor-pointer"
                                >
                                  <span className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 text-slate-300">
                                      <IconLibrary size={13} />
                                    </span>
                                    <span className="truncate font-medium">{pl.name}</span>
                                  </span>
                                  {justAdded ? (
                                    <IconCheck size={14} className="text-emerald-400 shrink-0" />
                                  ) : (
                                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                      {pl.trackCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      </>
                    )
                  )}
                </div>
              </div>

              <div className="text-right text-xs font-medium text-slate-400 tabular-nums">
                {formatDuration(track.durationMs)}
              </div>
            </div>
          );
        })}
        {bottomPad > 0 && <div style={{ height: bottomPad }} />}
      </div>
    </div>
  );
};
