import React, { useEffect, useMemo, useState } from "react";
import type { AppLanguage, Playlist, SourceKind, Track } from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { TRANSLATIONS } from "../lib/i18n";
import { SOURCE_META, SOURCE_ORDER } from "../lib/sources";
import {
  IconCheck,
  IconFolder,
  IconPlay,
  IconRefresh,
  IconSearch,
  IconTrash,
  SourceIcon,
} from "./AwaseIcons";
import { TrackList, type SortDir, type SortField } from "./TrackList";

interface LibraryViewProps {
  language: AppLanguage;
  tracks: Track[];
  searchResults: Track[] | null;
  searchQuery: string;
  sourceFilter: SourceKind | "all" | "liked";
  selectedPlaylist: Playlist | null;
  currentTrackId: string | null;
  isPlaying: boolean;
  coverPalette: CoverPalette;
  playlists: Playlist[];
  scanning: boolean;
  onSelectSourceFilter: (filter: SourceKind | "all" | "liked") => void;
  onClearSearch: () => void;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onToggleLike: (trackId: string) => void;
  onQueueTrack: (track: Track) => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onRemoveFromPlaylist?: (playlistId: string, track: Track) => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onDeleteTracks: (trackIds: string[]) => void;
  onClearLibrary: () => void;
  onRescanLocal: () => void;
  onAddLocalFolder: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  language,
  tracks,
  searchResults,
  searchQuery,
  sourceFilter,
  selectedPlaylist,
  currentTrackId,
  isPlaying,
  coverPalette,
  playlists,
  scanning,
  onSelectSourceFilter,
  onClearSearch,
  onPlayTrack,
  onToggleLike,
  onQueueTrack,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onDeletePlaylist,
  onDeleteTracks,
  onClearLibrary,
  onRescanLocal,
  onAddLocalFolder,
}) => {
  const [searchTab, setSearchTab] = useState<SourceKind | "all">("all");
  const [localFilter, setLocalFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeletePlaylist, setConfirmDeletePlaylist] = useState(false);

  const t = TRANSLATIONS[language];

  useEffect(() => {
    if (!confirmClearAll) return;
    const id = window.setTimeout(() => setConfirmClearAll(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmClearAll]);

  useEffect(() => {
    setConfirmDeletePlaylist(false);
  }, [selectedPlaylist?.id]);

  useEffect(() => {
    if (!confirmDeletePlaylist) return;
    const id = window.setTimeout(() => setConfirmDeletePlaylist(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmDeletePlaylist]);

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "added" || field === "duration" ? "desc" : "asc");
    }
  };

  const displayedTracks = useMemo(() => {
    let base = searchResults
      ? searchTab === "all"
        ? searchResults
        : searchResults.filter((item) => item.source === searchTab)
      : tracks;

    const q = localFilter.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.artist.toLowerCase().includes(q) ||
          item.album.toLowerCase().includes(q)
      );
    }

    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === "album") {
        cmp = a.album.localeCompare(b.album);
      } else if (sortField === "duration") {
        cmp = a.durationMs - b.durationMs;
      } else {
        cmp = a.addedAt - b.addedAt;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [searchResults, searchTab, tracks, localFilter, sortField, sortDir]);

  const title = searchResults
    ? `"${searchQuery}"`
    : selectedPlaylist
      ? selectedPlaylist.name
      : sourceFilter === "all"
        ? t.allMusic
        : sourceFilter === "liked"
          ? t.favorites
          : SOURCE_META[sourceFilter].name;

  const allSelected =
    displayedTracks.length > 0 && displayedTracks.every((tr) => selectedIds.has(tr.id));

  return (
    <div
      key={`${sourceFilter}-${selectedPlaylist?.id ?? "main"}-${searchQuery ? "search" : "lib"}`}
      className="space-y-5 pb-8 max-w-6xl mx-auto awase-view-enter"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
          <p className="text-xs font-medium text-slate-300 mt-0.5">
            {displayedTracks.length} {t.tracksCount}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {searchResults && (
            <button
              type="button"
              onClick={onClearSearch}
              className="px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white transition-colors cursor-pointer"
            >
              {t.clearSearch}
            </button>
          )}

          {selectedPlaylist && onDeletePlaylist && (
            <button
              type="button"
              onClick={() => {
                if (!confirmDeletePlaylist) {
                  setConfirmDeletePlaylist(true);
                } else {
                  setConfirmDeletePlaylist(false);
                  onDeletePlaylist(selectedPlaylist.id);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                confirmDeletePlaylist
                  ? "bg-rose-500/35 hover:bg-rose-500/45 border-rose-400 text-white"
                  : "bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-200"
              }`}
            >
              <IconTrash size={14} />
              <span>
                {confirmDeletePlaylist
                  ? language === "ru"
                    ? "Точно удалить?"
                    : "Confirm delete?"
                  : t.deletePlaylist}
              </span>
            </button>
          )}

          {!searchResults && tracks.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectMode((m) => !m);
                  setSelectedIds(new Set());
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium border transition-all active:scale-95 cursor-pointer ${
                  selectMode
                    ? "bg-white text-[#050507] border-white shadow-sm"
                    : "bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.08]"
                }`}
              >
                <IconCheck size={13} />
                <span>{selectMode ? t.cancelSelect : t.selectMode}</span>
              </button>

              {selectMode && (
                <button
                  type="button"
                  onClick={() => {
                    if (allSelected) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(displayedTracks.map((tr) => tr.id)));
                    }
                  }}
                  className="awase-menu-pop px-3.5 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.1] text-xs font-medium text-slate-200 transition-all active:scale-95 cursor-pointer"
                >
                  {allSelected ? t.deselectAll : t.selectAll}
                </button>
              )}

              {selectMode && selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTracks(Array.from(selectedIds));
                    setSelectedIds(new Set());
                    setSelectMode(false);
                  }}
                  className="awase-menu-pop inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-medium text-rose-200 transition-all active:scale-95 cursor-pointer"
                >
                  <IconTrash size={14} />
                  <span>
                    {t.deleteSelected} ({selectedIds.size})
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!confirmClearAll) {
                    setConfirmClearAll(true);
                  } else {
                    setConfirmClearAll(false);
                    setSelectMode(false);
                    setSelectedIds(new Set());
                    onClearLibrary();
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200 ease-out active:scale-95 cursor-pointer ${
                  confirmClearAll
                    ? "bg-rose-500/25 border border-rose-500/50 text-rose-100 scale-[1.03] shadow-[0_0_18px_rgba(244,63,94,0.28)]"
                    : "bg-white/[0.08] hover:bg-rose-500/15 border border-transparent text-slate-200 hover:text-rose-300"
                }`}
              >
                <IconTrash size={14} />
                <span>{confirmClearAll ? t.confirmClearLibrary : t.clearLibrary}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onAddLocalFolder}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <IconFolder size={14} className="text-cyanpulse" />
            <span>{t.addFolder}</span>
          </button>

          <button
            type="button"
            onClick={onRescanLocal}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <IconRefresh size={14} className={scanning ? "animate-spin text-cyanpulse" : ""} />
            <span>{scanning ? t.scanning : t.refresh}</span>
          </button>

          {displayedTracks.length > 0 && (
            <button
              type="button"
              onClick={() => onPlayTrack(displayedTracks[0], displayedTracks)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyanpulse text-[#050507] font-semibold text-xs hover:brightness-110 transition-all cursor-pointer"
            >
              <IconPlay size={14} />
              <span>{t.playAll}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {searchResults ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchTab("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                searchTab === "all"
                  ? "bg-white text-[#090B10]"
                  : "bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]"
              }`}
            >
              {t.allTab} ({searchResults.length})
            </button>
            {SOURCE_ORDER.map((id) => {
              const meta = SOURCE_META[id];
              const count = searchResults.filter((item) => item.source === id).length;
              const active = searchTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSearchTab(id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "text-white"
                      : "bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]"
                  }`}
                  style={
                    active
                      ? { backgroundColor: meta.badgeBg, color: meta.accent }
                      : undefined
                  }
                >
                  <SourceIcon source={id} size={13} />
                  <span>{meta.name}</span>
                  <span className="opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        ) : !selectedPlaylist ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectSourceFilter("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                sourceFilter === "all"
                  ? "bg-white text-[#090B10]"
                  : "bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]"
              }`}
            >
              {t.allTab}
            </button>
            <button
              type="button"
              onClick={() => onSelectSourceFilter("liked")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                sourceFilter === "liked"
                  ? "bg-white text-[#090B10]"
                  : "bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]"
              }`}
            >
              {t.favorites}
            </button>
            {SOURCE_ORDER.map((id) => {
              const meta = SOURCE_META[id];
              const active = sourceFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectSourceFilter(id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "text-white"
                      : "bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]"
                  }`}
                  style={
                    active
                      ? { backgroundColor: meta.badgeBg, color: meta.accent }
                      : undefined
                  }
                >
                  <SourceIcon source={id} size={13} />
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div />
        )}

        <div className="relative w-full sm:w-64">
          <IconSearch
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={localFilter}
            onChange={(e) => setLocalFilter(e.target.value)}
            placeholder={t.filterInList}
            className="w-full pl-9 pr-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.09] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-cyanpulse/50"
          />
        </div>
      </div>

      <TrackList
        language={language}
        tracks={displayedTracks}
        currentTrackId={currentTrackId}
        isPlaying={isPlaying}
        coverPalette={coverPalette}
        onPlayTrack={onPlayTrack}
        onToggleLike={onToggleLike}
        onQueueTrack={onQueueTrack}
        playlists={playlists}
        onAddToPlaylist={onAddToPlaylist}
        onRemoveFromPlaylist={
          selectedPlaylist && onRemoveFromPlaylist
            ? (tr) => onRemoveFromPlaylist(selectedPlaylist.id, tr)
            : undefined
        }
        sortField={sortField}
        sortDir={sortDir}
        onChangeSort={handleSortChange}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelect={(id) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        emptyTitle={searchResults ? t.nothingFound : t.emptyLibraryTitle}
        emptySubtitle={searchResults ? t.nothingFoundSub : t.emptyLibrarySubtitle}
      />
    </div>
  );
};
