import React, { useEffect, useState } from "react";
import type { AppLanguage, Track } from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { TRANSLATIONS } from "../lib/i18n";
import { formatDuration, SOURCE_META } from "../lib/sources";
import { IconPlay, IconQueue, IconTrash, IconWinClose, SourceIcon } from "./AwaseIcons";

interface QueueDrawerProps {
  open: boolean;
  language: AppLanguage;
  queue: Track[];
  currentIndex: number;
  coverPalette: CoverPalette;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  onRemoveIndex: (index: number) => void;
  onClearUpcoming: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  open,
  language,
  queue,
  currentIndex,
  coverPalette,
  onClose,
  onSelectIndex,
  onRemoveIndex,
  onClearUpcoming,
}) => {
  const t = TRANSLATIONS[language];
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const id = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmClear]);

  const currentItem = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  const indexed = queue.map((track, idx) => ({ track, idx }));
  const upcomingItems =
    currentIndex >= 0 && currentIndex < queue.length
      ? [...indexed.slice(currentIndex + 1), ...indexed.slice(0, currentIndex)]
      : indexed;

  return (
    <aside
      className={`shrink-0 border-l border-white/[0.08] awase-glass flex flex-col overflow-hidden transition-[width,opacity,transform] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? "w-[340px] opacity-100 translate-x-0"
          : "w-0 opacity-0 translate-x-4 border-l-0 pointer-events-none"
      }`}
    >
      <div className="w-[340px] h-full flex flex-col relative bg-[#0A0B0E]">
        <div className="relative z-10 px-4 py-3.5 border-b border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/[0.07] border border-white/[0.1] flex items-center justify-center text-white">
              <IconQueue size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white leading-tight">
                {t.queueTitle}
              </div>
              <div className="text-[11px] text-slate-400 tabular-nums">
                {queue.length} {t.tracksCount}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close queue"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.09] transition-all active:scale-95 cursor-pointer"
          >
            <IconWinClose size={12} />
          </button>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto awase-scroll p-3 space-y-4">
          {queue.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-2.5">
              <div className="w-11 h-11 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-slate-400">
                <IconQueue size={20} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{t.emptyQueue}</p>
            </div>
          ) : (
            <>
              {currentItem && (
                <div className="space-y-2">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t.nowPlayingQueue}
                  </div>
                  <div
                    onClick={() => onSelectIndex(currentIndex)}
                    className="group relative flex items-center gap-3 p-2.5 rounded-2xl border border-white/[0.12] bg-white/[0.06] cursor-pointer overflow-hidden transition-all duration-200 hover:bg-white/[0.09]"
                    style={{
                      boxShadow: `0 10px 28px -12px ${coverPalette.glow}`,
                    }}
                  >
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-[#101217] border border-white/[0.1] shrink-0 flex items-center justify-center">
                      {currentItem.coverUrl ? (
                        <img
                          src={currentItem.coverUrl}
                          alt={currentItem.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <SourceIcon source={SOURCE_META[currentItem.source].id} size={20} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white truncate">
                        {currentItem.title}
                      </div>
                      <div className="text-[11px] text-slate-300 truncate mt-0.5">
                        {currentItem.artist}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pr-1">
                      <span
                        className="w-2 h-2 rounded-full animate-[awasePulseOrb_1.6s_ease-in-out_infinite]"
                        style={{
                          backgroundColor: coverPalette.primary,
                          boxShadow: `0 0 10px ${coverPalette.primary}`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {upcomingItems.length > 0 && (
                <div className="space-y-1.5">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t.upNext} ({upcomingItems.length})
                  </div>
                  <div className="space-y-1">
                    {upcomingItems.map(({ track, idx }) => {
                      const meta = SOURCE_META[track.source];
                      return (
                        <div
                          key={`${track.id}-${idx}`}
                          onClick={() => onSelectIndex(idx)}
                          className="group flex items-center gap-2.5 p-2 rounded-xl text-xs border border-transparent hover:border-white/[0.08] hover:bg-white/[0.05] transition-all duration-200 cursor-pointer"
                        >
                          <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-[#101217] border border-white/[0.06] shrink-0 flex items-center justify-center">
                            {track.coverUrl ? (
                              <img
                                src={track.coverUrl}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <SourceIcon source={meta.id} size={18} />
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                              <IconPlay size={13} />
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-100 group-hover:text-white truncate transition-colors">
                              {track.title}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {track.artist}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[11px] text-slate-400 tabular-nums group-hover:hidden">
                              {formatDuration(track.durationMs)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveIndex(idx);
                              }}
                              aria-label="Remove from queue"
                              className="hidden group-hover:flex w-7 h-7 rounded-lg items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                            >
                              <IconTrash size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {queue.length > 1 && (
          <div className="relative z-10 p-3 border-t border-white/[0.07] shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                } else {
                  setConfirmClear(false);
                  onClearUpcoming();
                }
              }}
              className={`w-full py-2.5 rounded-xl text-xs font-medium border transition-all active:scale-[0.98] cursor-pointer ${
                confirmClear
                  ? "bg-rose-500/20 text-rose-200 border-rose-500/40"
                  : "bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border-white/[0.08]"
              }`}
            >
              {confirmClear ? t.confirmClear : t.clearQueue}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
