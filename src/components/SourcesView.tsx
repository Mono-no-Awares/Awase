import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AppLanguage,
  AppPreferences,
  AudioDevice,
  CacheStats,
  EqualizerState,
  FontFamilyChoice,
  FontScale,
  LocalFolder,
  MiniVisualizerMode,
  MotionStyle,
  RpcStyle,
  SourceKind,
  SourceStatus,
  UpdateCheckResult,
} from "../types";
import { api } from "../lib/ipc";
import { TRANSLATIONS } from "../lib/i18n";
import { SOURCE_META, SOURCE_ORDER } from "../lib/sources";
import { CustomSelect } from "./CustomSelect";
import { EqFader } from "./EqFader";
import { EQ_PRESETS } from "./EqualizerPopover";
import {
  AwaseLogo,
  IconBolt,
  IconCheck,
  IconDevice,
  IconEqualizer,
  IconFolder,
  IconLink,
  IconRefresh,
  IconTrash,
  SourceIcon,
} from "./AwaseIcons";

interface SourcesViewProps {
  preferences: AppPreferences;
  onUpdatePreferences: (next: AppPreferences) => void;
  statuses: SourceStatus[];
  folders: LocalFolder[];
  devices: AudioDevice[];
  selectedDevice: string;
  eqState: EqualizerState;
  busySource: string | null;
  onAddLocalFolder: () => void;
  onRemoveLocalFolder: (path: string) => void;
  onRescanLocal: () => void;
  onOpenYandexLogin: () => void;
  onConnectYandexToken: (token: string) => void;
  onSyncYandex: () => void;
  onOpenSpotifyWebLogin: () => void;
  onSyncSpotify: () => void;
  onImportSpotifyUrl: (url: string) => void;
  onImportSpotifyFile: () => void;
  onConnectSoundcloud: (token: string, handle?: string) => void;
  onSyncSoundcloud: () => void;
  onDisconnectSource: (source: SourceKind) => void;
  onSelectDevice: (name: string) => void;
  onUpdateEq: (state: EqualizerState) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onWipeData: (keepCredentials: boolean) => Promise<void>;
  onOpenExternalUrl: (url: string) => void;
}

const EQ_LABELS = ["60Hz", "230Hz", "910Hz", "3.6kHz", "14kHz"];

export const SourcesView: React.FC<SourcesViewProps> = ({
  preferences,
  onUpdatePreferences,
  statuses,
  folders,
  devices,
  selectedDevice,
  eqState,
  busySource,
  onAddLocalFolder,
  onRemoveLocalFolder,
  onRescanLocal,
  onOpenYandexLogin,
  onConnectYandexToken,
  onSyncYandex,
  onOpenSpotifyWebLogin,
  onSyncSpotify,
  onImportSpotifyUrl,
  onImportSpotifyFile,
  onConnectSoundcloud,
  onSyncSoundcloud,
  onDisconnectSource,
  onSelectDevice,
  onUpdateEq,
  onExportBackup,
  onImportBackup,
  onWipeData,
  onOpenExternalUrl,
}) => {
  const [expanded, setExpanded] = useState<SourceKind | null>(null);
  const [openAppearSec, setOpenAppearSec] = useState<"general" | "motion" | null>("general");
  const [yandexToken, setYandexToken] = useState("");
  const [yandexOpened, setYandexOpened] = useState(false);
  const [spotifyPlaylistInput, setSpotifyPlaylistInput] = useState("");
  const [scToken, setScToken] = useState("");
  const [scHandle, setScHandle] = useState("");
  const [ruBypass, setRuBypass] = useState<[number, boolean]>([1, false]);
  const [yandexQuality, setYandexQuality] = useState<number>(1);

  useEffect(() => {
    api.getRuBypassStatus().then(setRuBypass).catch(() => {});
    api.getYandexQuality().then(setYandexQuality).catch(() => {});
  }, []);

  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  const [wipeModalOpen, setWipeModalOpen] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);

  useEffect(() => {
    api.getCacheStats().then(setCacheStats).catch(() => {});
    api.checkForUpdates().then(setUpdateInfo).catch(() => {});
  }, []);

  const [settingsTab, setSettingsTab] = useState<
    "services" | "audio" | "appearance" | "system"
  >("services");

  const handleClearCache = async () => {
    setCacheClearing(true);
    try {
      const next = await api.clearCache();
      setCacheStats(next);
    } finally {
      setCacheClearing(false);
    }
  };

  const handleCheckUpdates = async () => {
    setUpdateBusy(true);
    setUpdateErr(null);
    try {
      const res = await api.checkForUpdates();
      setUpdateInfo(res);
    } catch (err) {
      setUpdateErr(String(err));
    } finally {
      setUpdateBusy(false);
    }
  };

  const t = TRANSLATIONS[preferences.language];
  const getStatus = (src: SourceKind) => statuses.find((s) => s.source === src);

  const toggleExpand = (src: SourceKind) => {
    setExpanded((prev) => (prev === src ? null : src));
  };

  const fontOptions = [
    { value: "dm", label: "DM Sans (Clean Modern)" },
    { value: "grotesk", label: "Space Grotesk (Geometric)" },
    { value: "segoe", label: "Segoe UI (Windows Native)" },
    { value: "mono", label: "JetBrains Mono (Technical)" },
  ];

  const deviceOptions = devices.map((d) => ({
    value: d.name,
    label: d.isDefault ? `${d.name} (Default)` : d.name,
  }));

  return (
    <div className="space-y-6 pb-10 max-w-4xl mx-auto awase-view-enter">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{t.connectionsHeader}</h1>
          <p className="text-xs text-slate-300 mt-1">{t.connectionsSub}</p>
        </div>

        <div className="inline-flex flex-wrap items-center p-1 rounded-2xl bg-white/[0.05] border border-white/[0.1] gap-1">
          {(
            [
              { id: "services" as const, label: preferences.language === "ru" ? "Сервисы" : "Services" },
              { id: "audio" as const, label: preferences.language === "ru" ? "Звук и EQ" : "Audio & EQ" },
              { id: "appearance" as const, label: preferences.language === "ru" ? "Оформление" : "Appearance" },
              { id: "system" as const, label: preferences.language === "ru" ? "Система" : "System" },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer ${
                settingsTab === tab.id
                  ? "bg-white text-[#07080C] shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {settingsTab === "services" && (
        <div className="space-y-2.5 awase-view-enter">
        {SOURCE_ORDER.map((src) => {
          const meta = SOURCE_META[src];
          const st = getStatus(src);
          const isOpen = expanded === src;
          const isConnected = st?.connected ?? false;

          return (
            <div
              key={src}
              className="awase-card rounded-2xl overflow-hidden transition-colors duration-200"
            >
              <button
                type="button"
                onClick={() => toggleExpand(src)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                    <SourceIcon source={src} size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-sm text-white">
                      {meta.name}
                    </div>
                    <div className="text-xs text-slate-300 truncate">
                      {st?.accountLabel ? st.accountLabel : isConnected ? t.connected : t.clickToSetup}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {isConnected && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-medium">
                      <IconCheck size={11} />
                      <span>{t.connected}</span>
                    </span>
                  )}
                  <span
                    className={`text-slate-300 text-xs transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </div>
              </button>

              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-3 border-t border-white/[0.06] space-y-4">
                    {src === "local" && (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-300">{t.localDesc}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={onRescanLocal}
                              className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white cursor-pointer"
                            >
                              <IconRefresh
                                size={14}
                                className={busySource === "local" ? "animate-spin text-cyanpulse" : ""}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={onAddLocalFolder}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-cyanpulse text-[#090B10] text-xs font-semibold cursor-pointer"
                            >
                              <IconFolder size={14} />
                              <span>{t.addFolder}</span>
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto awase-scroll">
                          {folders.length === 0 ? (
                            <div className="text-xs text-slate-400 py-2">{t.noFolders}</div>
                          ) : (
                            folders.map((folder) => (
                              <div
                                key={folder.path}
                                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-black/25 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="text-slate-200 truncate">{folder.path}</div>
                                  <div className="text-[11px] text-slate-400">
                                    {folder.trackCount} {t.tracksCount}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onRemoveLocalFolder(folder.path)}
                                  aria-label="Remove folder"
                                  className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}

                    {src === "yandex" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setYandexOpened(true);
                              onOpenYandexLogin();
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amberpulse text-[#050507] text-xs font-semibold hover:brightness-105 transition-all active:scale-95 cursor-pointer"
                          >
                            <IconLink size={14} />
                            <span>1. {t.authorizeBrowser}</span>
                          </button>
                          {isConnected && (
                            <>
                              <button
                                type="button"
                                onClick={onSyncYandex}
                                disabled={busySource === "yandex"}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
                              >
                                <IconRefresh
                                  size={14}
                                  className={busySource === "yandex" ? "animate-spin" : ""}
                                />
                                <span>{t.syncLibrary}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDisconnectSource("yandex")}
                                className="px-3.5 py-2 rounded-full text-xs text-rose-400 hover:bg-rose-500/12 transition-colors cursor-pointer"
                              >
                                {t.disconnect}
                              </button>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2.5 leading-relaxed">
                          {yandexOpened && !isConnected ? t.yandexHint : `2. ${t.yandexHint}`}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={yandexToken}
                            onChange={(e) => setYandexToken(e.target.value)}
                            placeholder={t.yandexPlaceholder}
                            className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amberpulse/50"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard
                                ?.readText()
                                .then((txt) => {
                                  if (txt.trim()) setYandexToken(txt.trim());
                                })
                                .catch(() => {});
                            }}
                            className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                          >
                            {t.pasteBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (yandexToken.trim()) {
                                onConnectYandexToken(yandexToken.trim());
                                setYandexToken("");
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-white text-[#050507] hover:bg-white/90 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                          >
                            {t.connectBtn}
                          </button>
                        </div>
                      </div>
                    )}

                    {src === "spotify" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-mintsignal/10 border border-mintsignal/25">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white">
                              {preferences.language === "ru"
                                ? "Вход в аккаунт Spotify Premium"
                                : "Spotify Premium Account"}
                            </div>
                            <div className="text-[11px] text-slate-300">
                              {preferences.language === "ru"
                                ? "Официальный вход для воспроизведения и синхронизации плейлистов/лайков"
                                : "Official login for Premium playback & syncing playlists/likes"}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={onOpenSpotifyWebLogin}
                              className="px-4 py-2 rounded-xl bg-mintsignal text-[#050507] text-xs font-semibold hover:brightness-105 transition-all active:scale-95 cursor-pointer"
                            >
                              {preferences.language === "ru" ? "Войти в Spotify" : "Login with Spotify"}
                            </button>
                            {isConnected && (
                              <>
                                <button
                                  type="button"
                                  onClick={onSyncSpotify}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
                                >
                                  <IconRefresh
                                    size={14}
                                    className={busySource === "spotify" ? "animate-spin" : ""}
                                  />
                                  <span>{t.syncLibrary}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDisconnectSource("spotify")}
                                  className="px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/12 transition-colors cursor-pointer"
                                >
                                  {t.disconnect}
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={spotifyPlaylistInput}
                            onChange={(e) => setSpotifyPlaylistInput(e.target.value)}
                            placeholder={t.spotifyPlaylistUrl}
                            className="flex-1 min-w-[220px] px-3.5 py-2 rounded-xl bg-[#0B0C10] border border-white/[0.14] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-mintsignal/60"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (spotifyPlaylistInput.trim()) {
                                onImportSpotifyUrl(spotifyPlaylistInput.trim());
                                setSpotifyPlaylistInput("");
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-mintsignal text-[#050507] text-xs font-semibold hover:brightness-105 transition-all active:scale-95 cursor-pointer"
                          >
                            {t.spotifyImportUrlBtn}
                          </button>
                          <button
                            type="button"
                            onClick={onImportSpotifyFile}
                            className="px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
                          >
                            {t.spotifyImportFileBtn}
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-200 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3.5 py-2.5 leading-relaxed">
                          {t.spotifyPremiumNote}
                        </p>
                      </div>
                    )}

                    {src === "soundcloud" && (
                      <div className="space-y-3">
                        <p className="text-[11px] text-slate-200 bg-white/[0.05] border border-white/[0.09] rounded-xl px-3.5 py-2.5 leading-relaxed">
                          {t.scHint}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={scHandle}
                            onChange={(e) => setScHandle(e.target.value)}
                            placeholder={t.scHandle}
                            className="px-3.5 py-2 rounded-xl bg-[#0B0C10] border border-white/[0.14] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-ember/60"
                          />
                          <div className="flex gap-1.5">
                            <input
                              type="password"
                              value={scToken}
                              onChange={(e) => setScToken(e.target.value)}
                              placeholder={t.scToken}
                              className="flex-1 px-3.5 py-2 rounded-xl bg-[#0B0C10] border border-white/[0.14] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-ember/60"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard
                                  ?.readText()
                                  .then((txt) => {
                                    if (txt.trim()) setScToken(txt.trim());
                                  })
                                  .catch(() => {});
                              }}
                              className="px-3 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.1] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                            >
                              {t.pasteBtn}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onConnectSoundcloud(scToken.trim(), scHandle.trim() || undefined)
                            }
                            className="px-4 py-2 rounded-full bg-ember text-[#050507] text-xs font-semibold hover:brightness-105 transition-all active:scale-95 cursor-pointer"
                          >
                            {t.linkProfile}
                          </button>
                          <button
                            type="button"
                            onClick={onSyncSoundcloud}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
                          >
                            <IconRefresh
                              size={14}
                              className={busySource === "soundcloud" ? "animate-spin" : ""}
                            />
                            <span>{t.importLikes}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenExternalUrl("https://soundcloud.com/signin")}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
                          >
                            <IconLink size={13} />
                            <span>{t.openSoundCloud}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {settingsTab === "appearance" && (
        <div className="space-y-2.5 awase-view-enter">
          <div className="awase-card rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenAppearSec((s) => (s === "general" ? null : "general"))}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <div>
                <div className="font-display font-semibold text-sm text-white">
                  {preferences.language === "ru" ? "Язык и типографика" : "Language & Typography"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {preferences.language === "ru"
                    ? "Язык интерфейса, размер и семейство шрифта"
                    : "Interface language, font size and font family"}
                </div>
              </div>
              <span className={`text-slate-400 text-xs transition-transform duration-200 ${openAppearSec === "general" ? "rotate-180" : ""}`}>
                ▾
              </span>
            </button>
            {openAppearSec === "general" && (
              <div className="px-5 pb-4 pt-2 border-t border-white/[0.06] space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.languageLabel}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: "ru", label: "Русский" },
                        { id: "en", label: "English" },
                      ] as Array<{ id: AppLanguage; label: string }>
                    ).map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() =>
                          onUpdatePreferences({ ...preferences, language: lang.id })
                        }
                        className={`py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                          preferences.language === lang.id
                            ? "bg-white text-[#090B10]"
                            : "bg-black/30 text-slate-200 hover:bg-white/[0.09]"
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.fontSizeLabel}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "sm", label: t.fontSizeSmall },
                        { id: "md", label: t.fontSizeMedium },
                        { id: "lg", label: t.fontSizeLarge },
                      ] as Array<{ id: FontScale; label: string }>
                    ).map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() =>
                          onUpdatePreferences({ ...preferences, fontScale: sz.id })
                        }
                        className={`py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                          preferences.fontScale === sz.id
                            ? "bg-white text-[#090B10]"
                            : "bg-black/30 text-slate-200 hover:bg-white/[0.09]"
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.fontFamilyLabel}
                  </label>
                  <CustomSelect
                    value={preferences.fontFamily}
                    options={fontOptions}
                    onChange={(val) =>
                      onUpdatePreferences({
                        ...preferences,
                        fontFamily: val as FontFamilyChoice,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="awase-card rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenAppearSec((s) => (s === "motion" ? null : "motion"))}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <div>
                <div className="font-display font-semibold text-sm text-white">
                  {preferences.language === "ru"
                    ? "Анимации, визуализатор и Discord"
                    : "Animations, Visualizer & Discord"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {preferences.language === "ru"
                    ? "Мини-визуализатор, игровой режим и Discord Rich Presence"
                    : "Mini-visualizer, Gaming Mode and Discord Rich Presence"}
                </div>
              </div>
              <span className={`text-slate-400 text-xs transition-transform duration-200 ${openAppearSec === "motion" ? "rotate-180" : ""}`}>
                ▾
              </span>
            </button>
            {openAppearSec === "motion" && (
              <div className="px-5 pb-4 pt-2 border-t border-white/[0.06] space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.miniVizLabel}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "bars", label: t.miniVizBars },
                        { id: "wave", label: t.miniVizWave },
                        { id: "off", label: t.miniVizOff },
                      ] as Array<{ id: MiniVisualizerMode; label: string }>
                    ).map((mv) => (
                      <button
                        key={mv.id}
                        type="button"
                        onClick={() =>
                          onUpdatePreferences({ ...preferences, miniVisualizer: mv.id })
                        }
                        className={`py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                          preferences.miniVisualizer === mv.id
                            ? "bg-white text-[#050507]"
                            : "bg-black/40 text-slate-200 hover:bg-white/[0.09]"
                        }`}
                      >
                        {mv.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.motionStyleLabel}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "fluid", label: t.motionFluid },
                        { id: "snappy", label: t.motionSnappy },
                        { id: "silk", label: t.motionSilk },
                      ] as Array<{ id: MotionStyle; label: string }>
                    ).map((ms) => (
                      <button
                        key={ms.id}
                        type="button"
                        onClick={() =>
                          onUpdatePreferences({ ...preferences, motionStyle: ms.id })
                        }
                        className={`py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer ${
                          preferences.motionStyle === ms.id
                            ? "bg-white text-[#050507]"
                            : "bg-black/40 text-slate-200 hover:bg-white/[0.09]"
                        }`}
                      >
                        {ms.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                      preferences.gamingMode
                        ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                        : "bg-white/[0.05] border-white/[0.08] text-slate-300"
                    }`}
                  >
                    <IconBolt size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">{t.gamingModeLabel}</div>
                    <div className="text-[11px] text-slate-400 leading-snug">{t.gamingModeDesc}</div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.gamingMode}
                  onClick={() =>
                    onUpdatePreferences({
                      ...preferences,
                      gamingMode: !preferences.gamingMode,
                    })
                  }
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex items-center shrink-0 cursor-pointer ${
                    preferences.gamingMode ? "bg-emerald-400" : "bg-white/[0.15]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      preferences.gamingMode ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">
                      {preferences.language === "ru"
                        ? "Карточка «Сейчас играет»"
                        : "Share Now Playing Card"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {preferences.language === "ru"
                        ? "Кнопка копирования PNG-карточки в буфер обмена"
                        : "Button to copy a styled PNG card to clipboard"}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.shareCardEnabled !== false}
                    onClick={() =>
                      onUpdatePreferences({
                        ...preferences,
                        shareCardEnabled: preferences.shareCardEnabled === false,
                      })
                    }
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex items-center shrink-0 cursor-pointer ${
                      preferences.shareCardEnabled !== false ? "bg-cyanpulse" : "bg-white/[0.18]"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        preferences.shareCardEnabled !== false ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">
                      {preferences.language === "ru"
                        ? "Статистика «Awase Wrapped»"
                        : "Awase Wrapped Stats"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {preferences.language === "ru"
                        ? "Локальная история часов и топ-5 треков/артистов"
                        : "Local listening hours and Top 5 tracks & artists"}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.wrappedEnabled !== false}
                    onClick={() =>
                      onUpdatePreferences({
                        ...preferences,
                        wrappedEnabled: preferences.wrappedEnabled === false,
                      })
                    }
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex items-center shrink-0 cursor-pointer ${
                      preferences.wrappedEnabled !== false ? "bg-cyanpulse" : "bg-white/[0.18]"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        preferences.wrappedEnabled !== false ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">{t.discordRpcLabel}</div>
                    <div className="text-[11px] text-slate-300 leading-snug">{t.discordRpcDesc}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.discordRpc}
                    onClick={() =>
                      onUpdatePreferences({
                        ...preferences,
                        discordRpc: !preferences.discordRpc,
                      })
                    }
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex items-center shrink-0 cursor-pointer ${
                      preferences.discordRpc ? "bg-cyanpulse" : "bg-white/[0.18]"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        preferences.discordRpc ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {preferences.discordRpc && (
                  <div className="rounded-xl bg-black/35 border border-white/[0.08] p-3.5 space-y-3.5">
                    <div className="rounded-xl bg-[#111214] border border-white/[0.07] p-3 space-y-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {preferences.language === "ru"
                          ? "Предпросмотр в Discord · Listening to Awase"
                          : "Discord Preview · Listening to Awase"}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative w-14 h-14 rounded-xl bg-[#07080C] border border-white/[0.1] flex items-center justify-center shrink-0 overflow-hidden">
                          <AwaseLogo size={28} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white truncate">
                            {preferences.language === "ru" ? "Название трека" : "Track Title"}
                          </div>
                          <div className="text-[11px] text-slate-300 truncate">
                            {(preferences.rpcStyle ?? "detailed") === "minimal"
                              ? "Artist Name"
                              : (preferences.rpcStyle ?? "detailed") === "audiophile"
                                ? "Artist Name · FLAC 980 kbps"
                                : (preferences.rpcStyle ?? "detailed") === "lyrics"
                                  ? "♪ Live synced lyrics line..."
                                  : "Artist Name · Album"}
                          </div>
                          {preferences.rpcShowTimestamps !== false && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[9px] text-slate-400 tabular-nums">01:12</span>
                              <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                                <div className="w-1/2 h-full bg-white rounded-full" />
                              </div>
                              <span className="text-[9px] text-slate-400 tabular-nums">02:45</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {preferences.rpcShowButtons !== false && (
                        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                          <div className="py-1 rounded-md bg-white/[0.08] text-center text-[10px] font-medium text-slate-200">
                            Listen Track
                          </div>
                          <div className="py-1 rounded-md bg-white/[0.08] text-center text-[10px] font-medium text-slate-200">
                            Awase Player
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-300">
                        {preferences.language === "ru" ? "Стиль текста" : "Display Style"}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {(
                          [
                            { id: "minimal", label: preferences.language === "ru" ? "Минимум" : "Minimal" },
                            { id: "detailed", label: preferences.language === "ru" ? "Детальный" : "Detailed" },
                            { id: "audiophile", label: preferences.language === "ru" ? "Аудиофил" : "Audiophile" },
                            { id: "lyrics", label: preferences.language === "ru" ? "Живой текст" : "Live Lyrics" },
                          ] as Array<{ id: RpcStyle; label: string }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onUpdatePreferences({ ...preferences, rpcStyle: opt.id })
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                              (preferences.rpcStyle ?? "detailed") === opt.id
                                ? "bg-white text-[#050507] shadow-sm"
                                : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.12] hover:text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {(
                        [
                          {
                            key: "rpcHideOnPause",
                            label: preferences.language === "ru" ? "Убирать статус на паузе" : "Hide RPC when Paused",
                            invertDefault: true,
                          },
                          {
                            key: "rpcShowIdle",
                            label: preferences.language === "ru" ? "Умный статус Idle" : "Smart Idle Status",
                          },
                          {
                            key: "rpcShowPaused",
                            label: preferences.language === "ru" ? "Показывать паузу" : "Show When Paused",
                            invertDefault: true,
                          },
                          {
                            key: "rpcShowButtons",
                            label: preferences.language === "ru" ? "Кнопки в профиле" : "Profile Buttons",
                          },
                          {
                            key: "rpcShowTimestamps",
                            label: preferences.language === "ru" ? "Полоса времени" : "Progress Timestamps",
                          },
                          {
                            key: "rpcShowSource",
                            label: preferences.language === "ru" ? "Источник в бейдже" : "Source Badge Text",
                          },
                        ] as ReadonlyArray<{
                          key:
                            | "rpcHideOnPause"
                            | "rpcShowIdle"
                            | "rpcShowPaused"
                            | "rpcShowButtons"
                            | "rpcShowTimestamps"
                            | "rpcShowSource";
                          label: string;
                          invertDefault?: boolean;
                        }>
                      ).map((item) => {
                        const checked = item.invertDefault
                          ? preferences[item.key] === true
                          : preferences[item.key] !== false;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() =>
                              onUpdatePreferences({ ...preferences, [item.key]: !checked })
                            }
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] text-slate-200 transition-colors cursor-pointer"
                          >
                            <span>{item.label}</span>
                            <span
                              className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                                checked ? "bg-cyanpulse" : "bg-white/[0.18]"
                              }`}
                            >
                              <span
                                className={`w-3 h-3 rounded-full bg-white transition-transform ${
                                  checked ? "translate-x-3" : "translate-x-0"
                                }`}
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {preferences.rpcShowIdle !== false && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-medium text-slate-300">
                          {preferences.language === "ru"
                            ? "Свой статус при простое (когда музыка не играет)"
                            : "Custom Idle Text (shown when no track is playing)"}
                        </div>
                        <input
                          type="text"
                          value={preferences.rpcIdleText ?? ""}
                          onChange={(e) =>
                            onUpdatePreferences({ ...preferences, rpcIdleText: e.target.value })
                          }
                          placeholder={
                            preferences.language === "ru"
                              ? "Оставьте пустым — Awase сам покажет ваш экран (Резонанс / Библиотека)"
                              : "Leave empty — Awase auto-detects your screen (Resonance / Library)"
                          }
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.09] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-cyanpulse/50"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            )}
          </div>
        </div>
      )}

      {settingsTab === "system" && (
        <div className="awase-card rounded-2xl p-5 space-y-4 awase-view-enter">
          <h2 className="font-display font-semibold text-base text-white">
            {preferences.language === "ru" ? "Система, сеть и данные" : "System, Network & Data"}
          </h2>
          <div className="space-y-3.5">
            <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white">
                        {preferences.language === "ru"
                          ? "Встроенный RU-обход SoundCloud"
                          : "Built-in SoundCloud RU Bypass"}
                      </span>
                      {(ruBypass[0] === 1 || (ruBypass[0] === 0 && ruBypass[1])) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300">
                          {preferences.language === "ru" ? "Активен" : "Active"}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-snug">
                      {preferences.language === "ru"
                        ? "Обходит блокировку 16 КБ без прав администратора, драйвера WinDivert и конфликта с другими программами."
                        : "Bypasses the 16 KB ISP throttle without admin rights, WinDivert driver, or conflicts."}
                    </div>
                  </div>
                  <div className="inline-flex rounded-xl bg-white/[0.05] border border-white/[0.08] p-0.5 shrink-0">
                    {(
                      [
                        { id: 0, label: preferences.language === "ru" ? "Авто" : "Auto" },
                        { id: 1, label: preferences.language === "ru" ? "Всегда" : "Always" },
                        { id: 2, label: preferences.language === "ru" ? "Выкл" : "Off" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          api.setRuBypassMode(opt.id).then(setRuBypass).catch(() => {});
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          ruBypass[0] === opt.id
                            ? "bg-white text-[#050507] shadow-sm"
                            : "text-slate-300 hover:text-white"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.08] grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onExportBackup}
                  className="py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
                >
                  {t.exportBackup}
                </button>
                <button
                  type="button"
                  onClick={onImportBackup}
                  className="py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
                >
                  {t.importBackup}
                </button>
              </div>

              <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white">
                    {preferences.language === "ru" ? "Кэш аудио и обложек" : "Audio & Cover Cache"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {cacheStats
                      ? `${(cacheStats.totalBytes / (1024 * 1024)).toFixed(1)} MB · ${cacheStats.fileCount} ${
                          preferences.language === "ru" ? "файлов" : "files"
                        }`
                      : "—"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={cacheClearing}
                  onClick={handleClearCache}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-[11px] font-medium text-white shrink-0 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {cacheClearing
                    ? preferences.language === "ru"
                      ? "Очистка..."
                      : "Clearing..."
                    : preferences.language === "ru"
                      ? "Очистить кэш"
                      : "Clear Cache"}
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-300">
                  {preferences.language === "ru"
                    ? "Авто-удаление кэша треков не из избранного"
                    : "Auto-clean cached non-favorite tracks"}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { days: 0, label: preferences.language === "ru" ? "При старте" : "On Start" },
                    { days: 3, label: preferences.language === "ru" ? "3 дн." : "3d" },
                    { days: 7, label: preferences.language === "ru" ? "7 дн." : "7d" },
                    { days: 14, label: preferences.language === "ru" ? "14 дн." : "14d" },
                    { days: -1, label: preferences.language === "ru" ? "Выкл" : "Off" },
                  ].map((opt) => {
                    const currentDays = preferences.cacheAutoCleanDays ?? 0;
                    return (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => {
                          onUpdatePreferences({
                            ...preferences,
                            cacheAutoCleanDays: opt.days,
                          });
                          if (opt.days >= 0) {
                            api
                              .cleanupNonFavoriteCache(opt.days)
                              .then(setCacheStats)
                              .catch(() => {});
                          }
                        }}
                        className={`py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          currentDays === opt.days
                            ? "bg-white text-[#050507]"
                            : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.12] hover:text-white"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white">
                      {preferences.language === "ru" ? "Обновления Awase" : "Awase Updates"}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {updateInfo
                        ? updateInfo.hasUpdate
                          ? `${preferences.language === "ru" ? "Доступна версия" : "Available"}: ${updateInfo.latestVersion}`
                          : `${preferences.language === "ru" ? "Установлена актуальная версия" : "Up to date"} (${updateInfo.latestVersion})`
                        : "GitHub: Mono-no-Awares/Awase"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {updateInfo?.hasUpdate && (
                      <button
                        type="button"
                        onClick={() => onOpenExternalUrl(updateInfo.releaseUrl)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-[11px] font-medium text-emerald-200 transition-all cursor-pointer"
                      >
                        {preferences.language === "ru" ? "Скачать" : "Download"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={updateBusy}
                      onClick={handleCheckUpdates}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-[11px] font-medium text-white transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {updateBusy
                        ? preferences.language === "ru"
                          ? "Проверка..."
                          : "Checking..."
                        : preferences.language === "ru"
                          ? "Проверить"
                          : "Check"}
                    </button>
                  </div>
                </div>
                {updateErr && <div className="text-[11px] text-rose-300">{updateErr}</div>}
              </div>

              <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-rose-200">
                    {preferences.language === "ru" ? "Удалить все данные" : "Reset App Data"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {preferences.language === "ru"
                      ? "Очистка треков, плейлистов или полный сброс"
                      : "Delete tracks & playlists or full factory reset"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWipeModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-medium text-rose-200 whitespace-nowrap shrink-0 transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  {preferences.language === "ru" ? "Сбросить данные" : "Reset Data"}
                </button>
              </div>
            </div>
          </div>
      )}

      {settingsTab === "audio" && (
        <div className="awase-card rounded-2xl p-5 space-y-4 awase-view-enter">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <IconEqualizer size={18} className="text-cyanpulse" />
              <h2 className="font-display font-semibold text-base text-white">{t.eqTitle}</h2>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={eqState.enabled}
              onClick={() => onUpdateEq({ ...eqState, enabled: !eqState.enabled })}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <span>{eqState.enabled ? t.eqOn : preferences.language === "ru" ? "Выкл" : "Off"}</span>
              <span
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex items-center ${
                  eqState.enabled ? "bg-cyanpulse" : "bg-white/[0.15]"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    eqState.enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.audioOutputLabel}
            </label>
            <CustomSelect
              value={selectedDevice}
              options={deviceOptions}
              onChange={onSelectDevice}
              icon={<IconDevice size={15} />}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {preferences.language === "ru"
                ? "Приоритет качества Яндекс Музыки"
                : "Yandex Music Stream Quality"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: 1,
                  label:
                    preferences.language === "ru"
                      ? "Высокое (320 kbps)"
                      : "High (320 kbps)",
                },
                {
                  id: 0,
                  label:
                    preferences.language === "ru"
                      ? "Быстрое (192 kbps)"
                      : "Fast (192 kbps)",
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    api.setYandexQuality(opt.id).then(setYandexQuality).catch(() => {});
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    yandexQuality === opt.id
                      ? "bg-white text-[#050507]"
                      : "bg-black/40 text-slate-200 hover:bg-white/[0.09]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {EQ_PRESETS.map((preset) => {
              const active = eqState.bands.every(
                (v, i) => Math.abs(v - preset.bands[i]) < 0.05
              );
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => onUpdateEq({ enabled: true, bands: preset.bands })}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-cyanpulse text-[#050507] shadow-sm"
                      : "bg-white/[0.07] hover:bg-white/[0.15] text-slate-200"
                  }`}
                >
                  {preferences.language === "ru" ? preset.ruName : preset.name}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {EQ_LABELS.map((label, idx) => (
              <EqFader
                key={label}
                label={label}
                value={eqState.bands[idx]}
                onChange={(nextVal) => {
                  const next = [...eqState.bands] as [number, number, number, number, number];
                  next[idx] = nextVal;
                  onUpdateEq({ ...eqState, bands: next });
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="awase-card rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <AwaseLogo size={36} />
          <div>
            <div className="font-display font-semibold text-sm text-white">
              Awase{" "}
              <span className="text-xs font-normal text-slate-300">
                v{updateInfo?.currentVersion ?? "0.2.5"}
              </span>
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              Crafted with care by <span className="text-white font-medium">Mono no Aware</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenExternalUrl("https://github.com/Mono-no-Awares")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
        >
          <IconLink size={14} />
          <span>github.com/Mono-no-Awares</span>
        </button>
      </div>

      {wipeModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 awase-view-enter"
            onClick={() => !wipeBusy && setWipeModalOpen(false)}
          >
            <div
              className="awase-menu-pop w-full max-w-md rounded-2xl bg-[#11131A]/95 border border-white/[0.12] shadow-[0_24px_64px_rgba(0,0,0,0.85)] p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1">
                <h3 className="font-display text-base font-bold text-white">
                  {preferences.language === "ru" ? "Удалить данные Awase?" : "Delete Awase Data?"}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {preferences.language === "ru"
                    ? "Выберите, нужно ли сохранить подключённые аккаунты Яндекс Музыки, Spotify и SoundCloud."
                    : "Choose whether to keep your connected Yandex Music, Spotify, and SoundCloud accounts."}
                </p>
              </div>
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={wipeBusy}
                  onClick={async () => {
                    setWipeBusy(true);
                    try {
                      await onWipeData(true);
                      api.getCacheStats().then(setCacheStats).catch(() => {});
                      setWipeModalOpen(false);
                    } finally {
                      setWipeBusy(false);
                    }
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.1] transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  <div className="text-xs font-semibold text-white">
                    {preferences.language === "ru"
                      ? "Удалить всё, кроме подключённых сервисов"
                      : "Delete everything except connected accounts"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {preferences.language === "ru"
                      ? "Удалит все треки, плейлисты, папки, историю волны и кэш"
                      : "Removes all tracks, playlists, folders, wave history & cache"}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={wipeBusy}
                  onClick={async () => {
                    setWipeBusy(true);
                    try {
                      await onWipeData(false);
                      api.getCacheStats().then(setCacheStats).catch(() => {});
                      setWipeModalOpen(false);
                    } finally {
                      setWipeBusy(false);
                    }
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  <div className="text-xs font-semibold text-rose-200">
                    {preferences.language === "ru"
                      ? "Удалить абсолютно всё (включая авторизации)"
                      : "Delete everything (including logins & tokens)"}
                  </div>
                  <div className="text-[11px] text-rose-300/75 mt-0.5">
                    {preferences.language === "ru"
                      ? "Полный сброс приложения к состоянию после установки"
                      : "Full factory reset of all tracks, accounts, and settings"}
                  </div>
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={wipeBusy}
                  onClick={() => setWipeModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  {preferences.language === "ru" ? "Отмена" : "Cancel"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
