import type { CoverPalette } from "./colorExtract";
import type { Track } from "../types";
import { api } from "./ipc";
import { SOURCE_META } from "./sources";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

async function loadImageSafe(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  let src = url;
  if (url.startsWith("http")) {
    try {
      src = await api.fetchCoverCached(url);
    } catch {
      src = url;
    }
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function copyTrackShareCard(
  track: Track,
  palette: CoverPalette
): Promise<void> {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  ctx.fillStyle = "#07080C";
  ctx.fillRect(0, 0, W, H);

  const g1 = ctx.createRadialGradient(280, 315, 20, 280, 315, 520);
  g1.addColorStop(0, palette.glow);
  g1.addColorStop(1, "rgba(7, 8, 12, 0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const g2 = ctx.createRadialGradient(960, 160, 10, 960, 160, 480);
  g2.addColorStop(0, `${palette.secondary}44`);
  g2.addColorStop(1, "rgba(7, 8, 12, 0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  roundRect(ctx, 44, 44, W - 88, H - 88, 36);
  ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.stroke();
  ctx.restore();

  const coverSize = 370;
  const coverX = 94;
  const coverY = (H - coverSize) / 2;

  ctx.save();
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, coverX, coverY, coverSize, coverSize, 28);
  ctx.fillStyle = "#101218";
  ctx.fill();
  ctx.restore();

  const coverImg = await loadImageSafe(track.coverUrl);
  ctx.save();
  roundRect(ctx, coverX, coverY, coverSize, coverSize, 28);
  ctx.clip();
  if (coverImg) {
    ctx.drawImage(coverImg, coverX, coverY, coverSize, coverSize);
  } else {
    const fg = ctx.createLinearGradient(coverX, coverY, coverX + coverSize, coverY + coverSize);
    fg.addColorStop(0, `${palette.primary}33`);
    fg.addColorStop(1, "#12151E");
    ctx.fillStyle = fg;
    ctx.fillRect(coverX, coverY, coverSize, coverSize);
  }
  ctx.restore();

  ctx.save();
  roundRect(ctx, coverX, coverY, coverSize, coverSize, 28);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();
  ctx.restore();

  const textX = coverX + coverSize + 56;
  const maxTextW = W - textX - 96;

  ctx.font = "600 18px 'DM Sans', 'Segoe UI', sans-serif";
  ctx.fillStyle = palette.primary;
  ctx.fillText("NOW PLAYING", textX, 178);

  ctx.font = "700 46px 'Space Grotesk', 'Segoe UI', sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(fitText(ctx, track.title, maxTextW), textX, 242);

  ctx.font = "500 28px 'DM Sans', 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fillText(fitText(ctx, track.artist, maxTextW), textX, 294);

  const metaLabel = SOURCE_META[track.source]?.name ?? track.source;
  const pillText = track.album && track.album !== metaLabel
    ? `${metaLabel} · ${track.album}`
    : metaLabel;
  ctx.font = "500 17px 'DM Sans', 'Segoe UI', sans-serif";
  const pillW = Math.min(maxTextW, ctx.measureText(pillText).width + 36);
  ctx.save();
  roundRect(ctx, textX, 336, pillW, 38, 19);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillText(fitText(ctx, pillText, pillW - 28), textX + 18, 361);

  const barHeights = [14, 26, 38, 22, 42, 30, 18, 34, 44, 24, 32, 16, 28, 36, 20, 12];
  for (let i = 0; i < barHeights.length; i++) {
    const bh = barHeights[i];
    const bx = textX + i * 14;
    const by = 456 - bh;
    ctx.fillStyle = i % 2 === 0 ? palette.primary : "rgba(255, 255, 255, 0.35)";
    roundRect(ctx, bx, by, 6, bh, 3);
    ctx.fill();
  }

  ctx.font = "700 22px 'Space Grotesk', 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText("Awase", W - 166, H - 82);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG"))), "image/png");
  });

  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } else {
    throw new Error("Clipboard image write is not supported");
  }
}
