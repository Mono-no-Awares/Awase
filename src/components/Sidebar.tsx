import React, { useState } from "react";
import type { ActiveView, AppLanguage, Playlist, SourceKind, SourceStatus } from "../types";
import { TRANSLATIONS } from "../lib/i18n";
import { SOURCE_META, SOURCE_ORDER } from "../lib/sources";
import {
  IconChevronDown,
  IconHeart,
  IconLibrary,
  IconPlus,
  IconResonance,
  IconSources,
  IconStage,
  IconTrash,
  SourceIcon,
} from "./AwaseIcons";

interface SidebarProps {
  language: AppLanguage;
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  sourceFilter: SourceKind | "all" | "liked";
  onSelectSourceFilter: (filter: SourceKind | "all" | "liked") => void;
  statuses: SourceStatus[];
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (id: string) => void;
  likedCount: number;
  totalCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  language,
  activeView,
  onSelectView,
  sourceFilter,
  onSelectSourceFilter,
  statuses,
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  likedCount,
  totalCount,
}) => {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [playlistsOpen, setPlaylistsOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const t = TRANSLATIONS[language];

  React.useEffect(() => {
    if (!confirmDeleteId) return;
    const id = window.setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => window.clearTimeout(id);
  }, [confirmDeleteId]);

  const navItems: Array<{
    id: ActiveView;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "stage", label: t.navHome, icon: <IconStage size={19} /> },
    { id: "resonance", label: t.navWave, icon: <IconResonance size={19} /> },
    { id: "library", label: t.navLibrary, icon: <IconLibrary size={19} /> },
    { id: "sources", label: t.navSettings, icon: <IconSources size={19} /> },
  ];

  const handleSubmitPlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onCreatePlaylist(trimmed);
    setDraftName("");
    setCreating(false);
  };

  return (
    <aside className="w-60 shrink-0 border-r border-white/[0.07] bg-[#0A0B0E]/95 flex flex-col overflow-hidden">
      <div className="shrink-0 px-3.5 pt-4 pb-3 space-y-4 border-b border-white/[0.06]">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                  active
                    ? "bg-white/[0.1] text-white shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <span className={active ? "text-cyanpulse" : "text-slate-300"}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div>
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            className="w-full px-3.5 py-1.5 rounded-lg flex items-center justify-between text-xs font-semibold tracking-wide text-slate-300 hover:text-white hover:bg-white/[0.04] uppercase transition-colors cursor-pointer"
          >
            <span>{t.sourcesTitle}</span>
            <IconChevronDown
              size={14}
              className={`text-slate-400 transition-transform duration-200 ${
                sourcesOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className={`grid transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              sourcesOpen ? "grid-rows-[1fr] opacity-100 mt-1.5" : "grid-rows-[0fr] opacity-0 mt-0"
            }`}
          >
            <div className="overflow-hidden space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  onSelectSourceFilter("all");
                  onSelectView("library");
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-[13px] transition-colors cursor-pointer ${
                  activeView === "library" && sourceFilter === "all" && !selectedPlaylistId
                    ? "bg-white/[0.1] text-white font-medium"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <span>{t.allMusic}</span>
                <span className="text-xs font-medium text-slate-300 tabular-nums">{totalCount}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectSourceFilter("liked");
                  onSelectView("library");
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-[13px] transition-colors cursor-pointer ${
                  activeView === "library" && sourceFilter === "liked" && !selectedPlaylistId
                    ? "bg-white/[0.1] text-white font-medium"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <IconHeart size={15} filled={likedCount > 0} className="text-cyanpulse" />
                  <span>{t.favorites}</span>
                </span>
                <span className="text-xs font-medium text-slate-300 tabular-nums">{likedCount}</span>
              </button>

              {SOURCE_ORDER.map((sourceId) => {
                const meta = SOURCE_META[sourceId];
                const status = statuses.find((s) => s.source === sourceId);
                const connected = status?.connected ?? false;
                const active =
                  activeView === "library" && sourceFilter === sourceId && !selectedPlaylistId;

                return (
                  <button
                    key={sourceId}
                    type="button"
                    onClick={() => {
                      onSelectSourceFilter(sourceId);
                      onSelectView("library");
                    }}
                    title={connected ? t.connected : t.clickToSetup}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-[13px] transition-colors cursor-pointer ${
                      active
                        ? "bg-white/[0.1] text-white font-medium"
                        : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <SourceIcon source={sourceId} size={16} />
                      <span className="truncate">{meta.name}</span>
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]" : "bg-slate-600"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-3.5 pt-3 pb-3">
        <div className="px-2 mb-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setPlaylistsOpen((v) => !v)}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs font-semibold tracking-wide text-slate-300 hover:text-white uppercase cursor-pointer"
          >
            <span>{t.playlists}</span>
            <IconChevronDown
              size={13}
              className={`text-slate-400 transition-transform duration-200 ${
                playlistsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaylistsOpen(true);
              setCreating((v) => !v);
            }}
            aria-label="Create playlist"
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <IconPlus size={15} />
          </button>
        </div>

        {playlistsOpen && (
          <>
            {creating && (
              <form onSubmit={handleSubmitPlaylist} className="mb-2 px-1 shrink-0">
                <input
                  type="text"
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={t.playlistPlaceholder}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#12151C] border border-cyanpulse/40 text-xs text-white placeholder:text-slate-400 focus:outline-none"
                />
              </form>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto awase-scroll space-y-0.5 pr-1">
              {playlists.length === 0 ? (
                <div className="px-3.5 py-2 text-xs text-slate-400">{t.noPlaylists}</div>
              ) : (
                playlists.map((pl) => {
                  const active = activeView === "library" && selectedPlaylistId === pl.id;
                  return (
                    <div
                      key={pl.id}
                      onClick={() => onSelectPlaylist(pl.id)}
                      className={`group w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer ${
                        active
                          ? "bg-white/[0.1] text-white font-medium"
                          : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate min-w-0">
                        <IconLibrary size={14} className="text-slate-400 shrink-0" />
                        <span className="truncate">{pl.name}</span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-xs font-medium text-slate-400 tabular-nums ${
                            confirmDeleteId === pl.id ? "hidden" : "group-hover:hidden"
                          }`}
                        >
                          {pl.trackCount}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirmDeleteId !== pl.id) {
                              setConfirmDeleteId(pl.id);
                            } else {
                              setConfirmDeleteId(null);
                              onDeletePlaylist(pl.id);
                            }
                          }}
                          title={t.deletePlaylist}
                          aria-label={t.deletePlaylist}
                          className={`rounded-md transition-colors cursor-pointer ${
                            confirmDeleteId === pl.id
                              ? "flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-rose-500/25 text-rose-200 border border-rose-500/40"
                              : "hidden group-hover:flex p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15"
                          }`}
                        >
                          {confirmDeleteId === pl.id ? (
                            <span>{language === "ru" ? "Удалить?" : "Delete?"}</span>
                          ) : (
                            <IconTrash size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
