import React from "react";
import type {
  ActiveView,
  AppLanguage,
  AudioTelemetry,
  Playlist,
  SourceKind,
  SourceStatus,
  Track,
} from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { TRANSLATIONS } from "../lib/i18n";
import { SOURCE_META, SOURCE_ORDER } from "../lib/sources";
import {
  IconFolder,
  IconPause,
  IconPlay,
  IconResonance,
  SourceIcon,
} from "./AwaseIcons";
import { TrackList } from "./TrackList";
import { VisualizerCanvas } from "./VisualizerCanvas";

interface StageViewProps {
  language: AppLanguage;
  tracks: Track[];
  currentTrack: Track | null;
  telemetry: AudioTelemetry;
  statuses: SourceStatus[];
  coverPalette: CoverPalette;
  gamingMode?: boolean;
  onPlayTrack: (track: Track, list: Track[]) => void;
  onTogglePlay: () => void;
  onToggleLike: (trackId: string) => void;
  onQueueTrack: (track: Track) => void;
  playlists?: Playlist[];
  onAddToPlaylist?: (playlistId: string, track: Track) => void;
  onSelectView: (view: ActiveView) => void;
  onSelectSourceFilter: (source: SourceKind) => void;
  onAddLocalFolder: () => void;
}

export const StageView: React.FC<StageViewProps> = ({
  language,
  tracks,
  currentTrack,
  telemetry,
  statuses,
  coverPalette,
  gamingMode = false,
  onPlayTrack,
  onTogglePlay,
  onToggleLike,
  onQueueTrack,
  playlists = [],
  onAddToPlaylist,
  onSelectView,
  onSelectSourceFilter,
  onAddLocalFolder,
}) => {
  const t = TRANSLATIONS[language];
  const activeMeta = currentTrack ? SOURCE_META[currentTrack.source] : SOURCE_META.local;
  const recentTracks = tracks.slice(0, 16);

  return (
    <div className="space-y-8 pb-8 max-w-6xl mx-auto awase-view-enter">
      <section className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0D0E12] min-h-[230px] flex flex-col justify-between p-7">
        <div
          className="absolute inset-0 opacity-65 pointer-events-none transition-all duration-1000"
          style={{
            background: `radial-gradient(circle at 82% 22%, ${coverPalette.glow}, transparent 58%), radial-gradient(circle at 15% 88%, ${coverPalette.secondary}26, transparent 52%)`,
          }}
        />
        <div className="absolute inset-0 opacity-75 pointer-events-none">
          <VisualizerCanvas
            styleMode="horizon"
            spectrum={telemetry.spectrum}
            peak={telemetry.peak}
            isPlaying={telemetry.isPlaying}
            accentColor={coverPalette.primary}
            secondaryColor={coverPalette.secondary}
            gamingMode={gamingMode}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/90 via-[#050507]/55 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 my-auto">
          <div className="flex items-center gap-5 min-w-0">
            {currentTrack && (
              <div
                className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-white/[0.14] bg-[#14151B] flex items-center justify-center transition-shadow duration-700"
                style={{ boxShadow: `0 18px 40px -10px ${coverPalette.glow}` }}
              >
                {currentTrack.coverUrl ? (
                  <img
                    src={currentTrack.coverUrl}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <SourceIcon source={activeMeta.id} size={34} />
                )}
              </div>
            )}

            <div className="min-w-0">
              <div
                className="text-xs font-medium mb-1 transition-colors duration-700"
                style={{ color: coverPalette.primary }}
              >
                {currentTrack ? `${t.nowPlaying} · ${activeMeta.name}` : "Awase"}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">
                {currentTrack ? currentTrack.title : t.welcomeTitle}
              </h1>
              <p className="text-sm text-slate-200 mt-1 truncate">
                {currentTrack ? currentTrack.artist : t.welcomeSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {currentTrack ? (
              <button
                type="button"
                onClick={() => onSelectView("resonance")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.16] text-sm font-medium text-white transition-all active:scale-[0.98] cursor-pointer"
              >
                <IconResonance size={16} />
                <span>{t.openWave}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onAddLocalFolder}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm text-[#050507] bg-white hover:bg-slate-200 transition-all active:scale-[0.98] cursor-pointer"
              >
                <IconFolder size={16} />
                <span>{t.addFolder}</span>
              </button>
            )}

            {currentTrack ? (
              <button
                type="button"
                onClick={onTogglePlay}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm text-[#050507] transition-all active:scale-[0.98] hover:brightness-110 cursor-pointer"
                style={{ backgroundColor: coverPalette.primary }}
              >
                {telemetry.isPlaying ? <IconPause size={15} /> : <IconPlay size={15} />}
                <span>{telemetry.isPlaying ? t.pause : t.resume}</span>
              </button>
            ) : tracks.length > 0 ? (
              <button
                type="button"
                onClick={() => onPlayTrack(tracks[0], tracks)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm text-[#050507] transition-all active:scale-[0.98] hover:brightness-110 cursor-pointer"
                style={{ backgroundColor: coverPalette.primary }}
              >
                <IconPlay size={15} />
                <span>{t.playAll}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectView("sources")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm text-white bg-white/[0.1] hover:bg-white/[0.16] transition-all cursor-pointer"
              >
                <span>{t.connectServices}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="font-display text-base font-semibold text-white">{t.sourcesTitle}</h2>
          <button
            type="button"
            onClick={() => onSelectView("sources")}
            className="text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {t.connectServices}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {SOURCE_ORDER.map((sourceId) => {
            const meta = SOURCE_META[sourceId];
            const status = statuses.find((s) => s.source === sourceId);
            const count = tracks.filter((tItem) => tItem.source === sourceId).length;
            const connected = status?.connected ?? false;
            const subtitle =
              count > 0
                ? `${count} ${t.tracksCount}`
                : connected
                  ? t.connected
                  : t.clickToSetup;

            return (
              <button
                key={sourceId}
                type="button"
                onClick={() => {
                  if (count > 0) {
                    onSelectSourceFilter(sourceId);
                    onSelectView("library");
                  } else {
                    onSelectView("sources");
                  }
                }}
                className="awase-card awase-card-hover rounded-2xl p-4 text-left flex flex-col justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.05]">
                    <SourceIcon source={sourceId} size={23} />
                  </span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]" : "bg-slate-600"
                    }`}
                  />
                </div>

                <div>
                  <div className="font-medium text-sm text-white">{meta.name}</div>
                  <div className="text-xs text-slate-300 mt-0.5 truncate">{subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="font-display text-base font-semibold text-white">{t.recentTracks}</h2>
          {tracks.length > 16 && (
            <button
              type="button"
              onClick={() => onSelectView("library")}
              className="text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {t.seeAll} ({tracks.length})
            </button>
          )}
        </div>

        <TrackList
          language={language}
          tracks={recentTracks}
          currentTrackId={currentTrack?.id ?? null}
          isPlaying={telemetry.isPlaying}
          coverPalette={coverPalette}
          onPlayTrack={onPlayTrack}
          onToggleLike={onToggleLike}
          onQueueTrack={onQueueTrack}
          playlists={playlists}
          onAddToPlaylist={onAddToPlaylist}
          emptyTitle={t.emptyLibraryTitle}
          emptySubtitle={t.emptyLibrarySubtitle}
        />
      </section>
    </div>
  );
};
