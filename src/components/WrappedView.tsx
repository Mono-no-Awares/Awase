import React, { useEffect, useState } from "react";
import type { AppLanguage, Track, WrappedStatsData } from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { api } from "../lib/ipc";
import { SOURCE_META } from "../lib/sources";
import { CoverArt } from "./CoverArt";
import { GalaxyMap } from "./GalaxyMap";
import { IconResonance, SourceIcon } from "./AwaseIcons";

interface WrappedViewProps {
  language: AppLanguage;
  coverPalette: CoverPalette;
  tracks: Track[];
  currentTrack: Track | null;
  onPlayTrack: (track: Track, list: Track[]) => void;
}

function formatHoursMinutes(ms: number, lang: AppLanguage): string {
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (lang === "ru") {
    return hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`;
  }
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export const WrappedView: React.FC<WrappedViewProps> = ({
  language,
  coverPalette,
  tracks,
  currentTrack,
  onPlayTrack,
}) => {
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [showGalaxy, setShowGalaxy] = useState(false);
  const [stats, setStats] = useState<WrappedStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = () => {
    setLoading(true);
    api
      .getWrappedStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
  }, []);

  const isRu = language === "ru";
  const totalMs = period === "week" ? stats?.totalMsWeek ?? 0 : stats?.totalMsAll ?? 0;
  const plays = period === "week" ? stats?.tracksPlayedWeek ?? 0 : stats?.tracksPlayedAll ?? 0;
  const topTracks = period === "week" ? stats?.topTracksWeek ?? [] : stats?.topTracksAll ?? [];
  const topArtists = period === "week" ? stats?.topArtistsWeek ?? [] : stats?.topArtistsAll ?? [];
  const maxArtistMs = topArtists[0]?.totalMs || 1;
  const topSourceMeta =
    stats?.topSource && stats.topSource in SOURCE_META
      ? SOURCE_META[stats.topSource as keyof typeof SOURCE_META]
      : null;

  return (
    <div className="flex-1 h-full overflow-y-auto awase-scroll px-6 py-6 space-y-6 awase-view-enter">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-1"
            style={{ color: coverPalette.primary }}
          >
            Awase Wrapped
          </div>
          <h1 className="font-display text-2xl font-bold text-white">
            {isRu ? "Твоя статистика прослушиваний" : "Your Listening Stats"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowGalaxy((g) => !g)}
            style={
              showGalaxy
                ? {
                    backgroundColor: `${coverPalette.primary}22`,
                    borderColor: `${coverPalette.primary}66`,
                    boxShadow: `0 0 18px -4px ${coverPalette.glow}`,
                  }
                : undefined
            }
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-medium transition-all duration-200 active:scale-95 cursor-pointer ${
              showGalaxy
                ? "text-white"
                : "bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.1] text-slate-200 hover:text-white"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <circle cx="5" cy="7" r="1.5" />
              <circle cx="19" cy="8" r="1.5" />
              <circle cx="7" cy="18" r="1.5" />
              <circle cx="18" cy="17" r="1.5" />
              <path d="M6.3 8.1 10.4 10.9M17.7 8.9 13.6 11M8.2 16.8l2.7-3.4M16.7 16l-3.3-2.9" />
            </svg>
            <span>
              {showGalaxy
                ? isRu
                  ? "Назад к Wrapped"
                  : "Back to Wrapped"
                : isRu
                  ? "Созвездие библиотеки"
                  : "Galaxy Map"}
            </span>
          </button>

          {!showGalaxy && (
            <div className="inline-flex items-center p-1 rounded-full bg-white/[0.06] border border-white/[0.1] gap-1">
              <button
                type="button"
                onClick={() => setPeriod("week")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                  period === "week"
                    ? "bg-white text-[#07080C] shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {isRu ? "За неделю" : "This Week"}
              </button>
              <button
                type="button"
                onClick={() => setPeriod("all")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                  period === "all"
                    ? "bg-white text-[#07080C] shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {isRu ? "За всё время" : "All Time"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showGalaxy ? (
        <GalaxyMap
          language={language}
          tracks={tracks}
          currentTrack={currentTrack}
          coverPalette={coverPalette}
          onPlayTrack={onPlayTrack}
        />
      ) : (
      <>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="awase-card rounded-2xl p-5 space-y-1">
          <div className="text-xs text-slate-400">
            {isRu ? "Время в музыке" : "Listening Time"}
          </div>
          <div className="font-display text-2xl font-bold text-white tabular-nums">
            {loading && !stats ? "—" : formatHoursMinutes(totalMs, language)}
          </div>
        </div>

        <div className="awase-card rounded-2xl p-5 space-y-1">
          <div className="text-xs text-slate-400">
            {isRu ? "Прослушано треков" : "Tracks Played"}
          </div>
          <div className="font-display text-2xl font-bold text-white tabular-nums">
            {loading && !stats ? "—" : plays}
          </div>
        </div>

        <div className="awase-card rounded-2xl p-5 space-y-1">
          <div className="text-xs text-slate-400">
            {isRu ? "Главный источник" : "Top Source"}
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {topSourceMeta ? (
              <>
                <SourceIcon source={topSourceMeta.id} size={18} />
                <span className="font-display text-xl font-bold text-white">
                  {topSourceMeta.name}
                </span>
              </>
            ) : (
              <span className="font-display text-xl font-bold text-slate-400">—</span>
            )}
          </div>
        </div>
      </div>

      {plays === 0 && !loading ? (
        <div className="awase-card rounded-2xl p-10 text-center space-y-2">
          <IconResonance size={30} className="mx-auto text-slate-500" />
          <p className="text-sm font-medium text-white">
            {isRu ? "Пока недостаточно прослушиваний" : "Not enough listening history yet"}
          </p>
          <p className="text-xs text-slate-400">
            {isRu
              ? "Послушай несколько треков — здесь появятся твои топ-5 артистов и песен."
              : "Listen to a few tracks and your Top 5 artists & songs will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="awase-card rounded-2xl p-5 space-y-4">
            <h2 className="font-display font-semibold text-base text-white">
              {isRu ? "Топ-5 треков" : "Top 5 Tracks"}
            </h2>
            <div className="space-y-3">
              {topTracks.map((tr, i) => (
                <div
                  key={tr.trackId}
                  className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <span
                    className="w-6 text-center font-display font-bold text-sm tabular-nums"
                    style={{ color: i === 0 ? coverPalette.primary : "#94A3B8" }}
                  >
                    #{i + 1}
                  </span>
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#101217] border border-white/[0.08] shrink-0 flex items-center justify-center">
                    <CoverArt
                      url={tr.coverUrl}
                      alt={tr.title}
                      fallback={<IconResonance size={16} className="text-slate-400" />}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">{tr.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{tr.artist}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-white tabular-nums">
                      {tr.plays}×
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      {Math.max(1, Math.round(tr.totalMs / 60000))} {isRu ? "мин" : "m"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="awase-card rounded-2xl p-5 space-y-4">
            <h2 className="font-display font-semibold text-base text-white">
              {isRu ? "Топ-5 артистов" : "Top 5 Artists"}
            </h2>
            <div className="space-y-3.5">
              {topArtists.map((ar, i) => {
                const pct = Math.max(8, Math.round((ar.totalMs / maxArtistMs) * 100));
                return (
                  <div key={ar.artist} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="font-display font-bold tabular-nums"
                          style={{ color: i === 0 ? coverPalette.primary : "#94A3B8" }}
                        >
                          #{i + 1}
                        </span>
                        <span className="font-medium text-white truncate">{ar.artist}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                        {formatHoursMinutes(ar.totalMs, language)} · {ar.plays}×
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${coverPalette.primary}, ${coverPalette.secondary})`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
