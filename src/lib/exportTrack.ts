import { save } from "@tauri-apps/plugin-dialog";
import { api } from "./ipc";
import type { AppLanguage, Track } from "../types";

export type ExportAudioFormat = "mp3" | "wav" | "original";

function emitNotify(msg: string, onNotify?: (msg: string) => void) {
  if (onNotify) {
    onNotify(msg);
  } else {
    window.dispatchEvent(new CustomEvent("awase:notify", { detail: msg }));
  }
}

function sanitizeFileName(raw: string): string {
  return (
    raw
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .trim()
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 120) || "track"
  );
}

export async function exportTrackWithDialog(
  track: Track,
  format: ExportAudioFormat,
  language: AppLanguage,
  onNotify?: (msg: string) => void
): Promise<void> {
  if (track.source === "spotify") {
    emitNotify(
      language === "ru"
        ? "Треки Spotify защищены DRM и не экспортируются"
        : "Spotify tracks are DRM-protected and cannot be exported",
      onNotify
    );
    return;
  }

  const ext = format === "original" ? "mp3" : format;
  const baseName = sanitizeFileName(`${track.artist} - ${track.title}`);
  const filters =
    format === "original"
      ? [{ name: "Audio", extensions: ["mp3", "aac", "m4a", "flac", "wav", "ogg"] }]
      : [{ name: ext.toUpperCase(), extensions: [ext] }];

  const destPath = await save({
    defaultPath: `${baseName}.${ext}`,
    filters,
  });

  if (!destPath) return;

  emitNotify(
    language === "ru" ? `Экспорт ${track.title}...` : `Exporting ${track.title}...`,
    onNotify
  );

  try {
    const savedPath = await api.exportTrackAudio(track, format, destPath);
    const fileName = savedPath.split(/[/\\]/).pop() || savedPath;
    emitNotify(language === "ru" ? `Сохранено: ${fileName}` : `Saved: ${fileName}`, onNotify);
  } catch (err) {
    emitNotify(String(err), onNotify);
  }
}
