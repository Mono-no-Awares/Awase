import type { SourceKind } from "../types";

export interface SourceMeta {
  id: SourceKind;
  name: string;
  shortName: string;
  accent: string;
  glow: string;
  badgeBg: string;
  description: string;
}

export const SOURCE_META: Record<SourceKind, SourceMeta> = {
  local: {
    id: "local",
    name: "Local Vault",
    shortName: "LOCAL",
    accent: "#38BDF8",
    glow: "rgba(56, 189, 248, 0.35)",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    description: "FLAC, WAV, MP3, AAC, OGG & Opus scanned directly from your folders.",
  },
  yandex: {
    id: "yandex",
    name: "Yandex Music",
    shortName: "YANDEX",
    accent: "#FFCC00",
    glow: "rgba(255, 204, 0, 0.3)",
    badgeBg: "rgba(255, 204, 0, 0.14)",
    description: "Browser authorization, liked collection, playlists & 320kbps streams.",
  },
  spotify: {
    id: "spotify",
    name: "Spotify",
    shortName: "SPOTIFY",
    accent: "#22C55E",
    glow: "rgba(34, 197, 94, 0.3)",
    badgeBg: "rgba(34, 197, 94, 0.14)",
    description: "PKCE browser login, library sync & track search.",
  },
  soundcloud: {
    id: "soundcloud",
    name: "SoundCloud",
    shortName: "SC",
    accent: "#FF6B2C",
    glow: "rgba(255, 107, 44, 0.32)",
    badgeBg: "rgba(255, 107, 44, 0.14)",
    description: "Public search & profile likes import.",
  },
};

export const SOURCE_ORDER: SourceKind[] = [
  "local",
  "yandex",
  "spotify",
  "soundcloud",
];

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
