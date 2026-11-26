import React, { useState } from "react";
import type {
  AppLanguage,
  AppPreferences,
  AudioDevice,
  EqualizerState,
  FontFamilyChoice,
  FontScale,
  LocalFolder,
  MiniVisualizerMode,
  MotionStyle,
  SourceKind,
  SourceStatus,
} from "../types";
import { TRANSLATIONS } from "../lib/i18n";
import { SOURCE_META, SOURCE_ORDER } from "../lib/sources";
import { CustomSelect } from "./CustomSelect";
import { EqFader } from "./EqFader";
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
  onOpenSpotifyLogin: (clientId: string) => void;
  onConnectSpotify: (clientId: string, token?: string) => void;
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
  onOpenSpotifyLogin,
  onConnectSpotify,
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
  onOpenExternalUrl,
}) => {
  const [expanded, setExpanded] = useState<SourceKind | null>(null);
  const [yandexToken, setYandexToken] = useState("");
  const [yandexOpened, setYandexOpened] = useState(false);
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyToken, setSpotifyToken] = useState("");
  const [spotifyPlaylistInput, setSpotifyPlaylistInput] = useState("");
  const [scToken, setScToken] = useState("");
  const [scHandle, setScHandle] = useState("");

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
    <div className="space-y-7 pb-10 max-w-4xl mx-auto awase-view-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">{t.connectionsHeader}</h1>
        <p className="text-xs text-slate-300 mt-1">{t.connectionsSub}</p>
      </div>

      <div className="space-y-2.5">
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
                      <span>{src === "soundcloud" ? t.ready : t.connected}</span>
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={spotifyClientId}
                            onChange={(e) => setSpotifyClientId(e.target.value)}
                            placeholder={t.spotifyClientId}
                            className="px-3.5 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-mintsignal/50"
                          />
                          <div className="flex gap-1.5">
                            <input
                              type="password"
                              value={spotifyToken}
                              onChange={(e) => setSpotifyToken(e.target.value)}
                              placeholder={t.spotifyToken}
                              className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-mintsignal/50"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard
                                  ?.readText()
                                  .then((txt) => {
                                    if (txt.trim()) setSpotifyToken(txt.trim());
                                  })
                                  .catch(() => {});
                              }}
                              className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                            >
                              {t.pasteBtn}
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3.5 py-2">
                          {t.spotifyRedirectHint}{" "}
                          <span className="text-white font-mono select-all">
                            http://127.0.0.1:43821/callback
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenSpotifyLogin(spotifyClientId.trim())}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-mintsignal text-[#050507] text-xs font-semibold hover:brightness-105 transition-all active:scale-95 cursor-pointer"
                          >
                            <IconLink size={14} />
                            <span>{t.authorizeBrowser}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenExternalUrl("https://developer.spotify.com/dashboard")
                            }
                            className="px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-medium text-slate-200 transition-all active:scale-95 cursor-pointer"
                          >
                            {t.openDashboard}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onConnectSpotify(spotifyClientId.trim(), spotifyToken.trim() || undefined)
                            }
                            className="px-4 py-2 rounded-full bg-white text-[#050507] hover:bg-white/90 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                          >
                            {t.saveToken}
                          </button>
                          {isConnected && (
                            <>
                              <button
                                type="button"
                                onClick={onSyncSpotify}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-medium text-white transition-all active:scale-95 cursor-pointer"
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
                                className="px-3 py-2 rounded-full text-xs text-rose-400 hover:bg-rose-500/12 transition-colors cursor-pointer"
                              >
                                {t.disconnect}
                              </button>
                            </>
                          )}
                        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="awase-card rounded-2xl p-5 space-y-4">
          <h2 className="font-display font-semibold text-base text-white">
            {t.appearanceHeader}
          </h2>

          <div className="space-y-3.5">
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

            <div className="pt-3 border-t border-white/[0.06] space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200">{t.coverAdaptiveLabel}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.coverAdaptiveTheme}
                  onClick={() =>
                    onUpdatePreferences({
                      ...preferences,
                      coverAdaptiveTheme: !preferences.coverAdaptiveTheme,
                    })
                  }
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex items-center cursor-pointer ${
                    preferences.coverAdaptiveTheme ? "bg-cyanpulse" : "bg-white/[0.15]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      preferences.coverAdaptiveTheme ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
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
                      className={`py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
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

              <div className="text-xs font-medium text-slate-300">{t.themeHeader}</div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {[
                    { accent: "#E2E8F0", bg: "#050507", name: "Platinum" },
                    { accent: "#A78BFA", bg: "#06050B", name: "Violet" },
                    { accent: "#F5D0A9", bg: "#080605", name: "Champagne" },
                    { accent: "#34D399", bg: "#040806", name: "Emerald" },
                    { accent: "#FB7185", bg: "#090507", name: "Rose" },
                  ].map((preset) => {
                    const active =
                      !preferences.coverAdaptiveTheme &&
                      preferences.accentColor.toLowerCase() === preset.accent.toLowerCase();
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        title={preset.name}
                        onClick={() =>
                          onUpdatePreferences({
                            ...preferences,
                            coverAdaptiveTheme: false,
                            accentColor: preset.accent,
                            bgColor: preset.bg,
                          })
                        }
                        className={`w-7 h-7 rounded-full border transition-transform active:scale-90 cursor-pointer ${
                          active ? "border-white scale-110" : "border-white/20 hover:scale-105"
                        }`}
                        style={{ backgroundColor: preset.accent }}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/[0.1] hover:border-white/[0.2] text-[11px] text-slate-200 transition-colors cursor-pointer">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                      style={{ backgroundColor: preferences.accentColor }}
                    />
                    <span>{t.accentColorLabel}</span>
                    <input
                      type="color"
                      value={preferences.accentColor}
                      onChange={(e) =>
                        onUpdatePreferences({
                          ...preferences,
                          coverAdaptiveTheme: false,
                          accentColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/[0.1] hover:border-white/[0.2] text-[11px] text-slate-200 transition-colors cursor-pointer">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                      style={{ backgroundColor: preferences.bgColor }}
                    />
                    <span>{t.bgColorLabel}</span>
                    <input
                      type="color"
                      value={preferences.bgColor}
                      onChange={(e) =>
                        onUpdatePreferences({
                          ...preferences,
                          coverAdaptiveTheme: false,
                          bgColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                  </label>
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
                    <div className="text-[11px] text-slate-400 truncate">{t.gamingModeDesc}</div>
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

              <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white">{t.discordRpcLabel}</div>
                  <div className="text-[11px] text-slate-300 truncate">{t.discordRpcDesc}</div>
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
                    preferences.discordRpc ? "bg-indigo-400" : "bg-white/[0.18]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      preferences.discordRpc ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
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
            </div>
          </div>
        </div>

        <div className="awase-card rounded-2xl p-5 space-y-4">
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
              <span>{t.eqOn}</span>
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
      </div>

      <div className="awase-card rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <AwaseLogo size={36} />
          <div>
            <div className="font-display font-semibold text-sm text-white">
              Awase <span className="text-xs font-normal text-slate-300">v0.1.0</span>
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
    </div>
  );
};
