export type SourceKind =
  | "local"
  | "yandex"
  | "spotify"
  | "soundcloud";

export type ActiveView = "stage" | "resonance" | "library" | "sources";

export type WaveSource = "yandex" | "soundcloud" | "mix";

export interface ZapretStatus {
  installed: boolean;
  running: boolean;
  externalRunning: boolean;
  listPath: string;
  exePath: string;
  strategy?: string | null;
  progress?: string | null;
}

export interface LyricWord {
  timeMs: number;
  durationMs?: number;
  text: string;
}

export interface LyricLine {
  timeMs: number | null;
  text: string;
  words?: LyricWord[];
}

export interface CacheStats {
  totalBytes: number;
  fileCount: number;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseName: string;
}

export interface LyricsPayload {
  synced: boolean;
  instrumental: boolean;
  source: string;
  lines: LyricLine[];
}

export type VisualizerStyle = "aura" | "silk" | "orbital";

export type MiniVisualizerMode = "bars" | "wave" | "off";

export type RepeatMode = "off" | "all" | "one";

export type AppLanguage = "ru" | "en";

export type FontScale = "sm" | "md" | "lg";

export type FontFamilyChoice = "dm" | "grotesk" | "segoe" | "mono";

export type MotionStyle = "fluid" | "snappy" | "silk";

export interface AppPreferences {
  language: AppLanguage;
  fontScale: FontScale;
  fontFamily: FontFamilyChoice;
  visualizerStyle: VisualizerStyle;
  miniVisualizer: MiniVisualizerMode;
  accentColor: string;
  bgColor: string;
  coverAdaptiveTheme: boolean;
  motionStyle: MotionStyle;
  gamingMode: boolean;
  discordRpc: boolean;
  discordAppId: string;
}

export interface Track {
  id: string;
  source: SourceKind;
  externalId: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  coverUrl: string | null;
  streamUrl: string | null;
  localPath: string | null;
  codec: string | null;
  bitrateKbps: number | null;
  sampleRateHz: number | null;
  liked: boolean;
  addedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  source: SourceKind;
  trackCount: number;
  coverUrl: string | null;
  description: string | null;
}

export interface SourceStatus {
  source: SourceKind;
  connected: boolean;
  accountLabel: string | null;
  details: string;
  hasCredentials: boolean;
}

export interface AudioTelemetry {
  isPlaying: boolean;
  currentTrackId: string | null;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  sampleRateHz: number;
  channels: number;
  codec: string;
  bitrateKbps: number;
  deviceName: string;
  spectrum: number[];
  rmsLeft: number;
  rmsRight: number;
  peak: number;
}

export interface LocalFolder {
  path: string;
  trackCount: number;
  lastScanned: number;
}

export interface AudioDevice {
  name: string;
  isDefault: boolean;
}

export interface EqualizerState {
  enabled: boolean;
  bands: [number, number, number, number, number];
}
