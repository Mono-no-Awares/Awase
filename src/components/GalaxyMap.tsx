import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AppLanguage, Track } from "../types";
import type { CoverPalette } from "../lib/colorExtract";
import { SOURCE_META } from "../lib/sources";
import { CoverArt } from "./CoverArt";
import { IconPlay, SourceIcon } from "./AwaseIcons";

interface GalaxyMapProps {
  language: AppLanguage;
  tracks: Track[];
  currentTrack: Track | null;
  coverPalette: CoverPalette;
  onPlayTrack: (track: Track, list: Track[]) => void;
}

interface StarNode {
  track: Track;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  glowColor: string;
  phase: number;
  artistKey: string;
  isHub: boolean;
}

interface EdgeLink {
  a: number;
  b: number;
  cx: number;
  cy: number;
  sameArtist: boolean;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorForArtist(artist: string, source: Track["source"]): { core: string; glow: string } {
  const h = hashStr(artist.toLowerCase());
  const hue = h % 360;
  const sat = source === "yandex" ? 86 : source === "soundcloud" ? 90 : 78;
  return {
    core: `hsl(${hue}, ${sat}%, 76%)`,
    glow: `hsla(${hue}, ${sat}%, 64%, 0.45)`,
  };
}

export const GalaxyMap: React.FC<GalaxyMapProps> = ({
  language,
  tracks,
  currentTrack,
  coverPalette,
  onPlayTrack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredStar, setHoveredStar] = useState<{
    star: StarNode;
    screenX: number;
    screenY: number;
  } | null>(null);

  const camRef = useRef({
    x: 0,
    y: 0,
    zoom: 1,
    targetX: 0,
    targetY: 0,
    targetZoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
    moved: false,
    mouseX: 0,
    mouseY: 0,
  });
  const hoveredIdRef = useRef<string | null>(null);

  const { stars, edges, dust, artistLabels } = useMemo(() => {
    const sorted = [...tracks]
      .sort((a, b) => (b.liked ? 1 : 0) - (a.liked ? 1 : 0))
      .slice(0, 150);

    const artistCenters = new Map<string, { x: number; y: number; name: string }>();
    const uniqueArtists: string[] = [];
    for (const tr of sorted) {
      const key = (tr.artist || "unknown").trim().toLowerCase();
      if (!artistCenters.has(key)) {
        uniqueArtists.push(key);
        artistCenters.set(key, { x: 0, y: 0, name: tr.artist || "Unknown" });
      }
    }

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    uniqueArtists.forEach((key, idx) => {
      const r = 68 + Math.sqrt(idx + 1) * 64;
      const a = idx * goldenAngle + (hashStr(key) % 100) * 0.012;
      const entry = artistCenters.get(key)!;
      artistCenters.set(key, { x: Math.cos(a) * r, y: Math.sin(a) * r, name: entry.name });
    });

    const seenHub = new Set<string>();
    const nodes: StarNode[] = sorted.map((track, idx) => {
      const artistKey = (track.artist || "unknown").trim().toLowerCase();
      const center = artistCenters.get(artistKey) ?? { x: 0, y: 0, name: "" };
      const h = hashStr(track.id);
      const localA = ((h % 360) * Math.PI) / 180;
      const localR = 12 + ((h >> 8) % 52);
      const isHub = !seenHub.has(artistKey);
      seenHub.add(artistKey);
      const col = colorForArtist(track.artist, track.source);
      return {
        track,
        x: center.x + Math.cos(localA) * localR,
        y: center.y + Math.sin(localA) * localR,
        z: 0.75 + ((h >> 16) % 50) / 100,
        radius: track.liked ? 4.2 : isHub ? 3.5 : 2.5 + (idx % 3) * 0.35,
        color: col.core,
        glowColor: col.glow,
        phase: (h % 628) / 100,
        artistKey,
        isHub,
      };
    });

    const links: EdgeLink[] = [];
    for (let i = 0; i < nodes.length; i++) {
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d2 = dx * dx + dy * dy;
        const same = nodes[i].artistKey === nodes[j].artistKey;
        if (same && d2 < 14000) {
          const mx = (nodes[i].x + nodes[j].x) * 0.5 - dy * 0.14;
          const my = (nodes[i].y + nodes[j].y) * 0.5 + dx * 0.14;
          links.push({ a: i, b: j, cx: mx, cy: my, sameArtist: true });
        } else if (d2 < nearestDist && d2 < 10500) {
          nearestDist = d2;
          nearestIdx = j;
        }
      }
      if (nearestIdx >= 0) {
        const a = nodes[i];
        const b = nodes[nearestIdx];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        links.push({
          a: i,
          b: nearestIdx,
          cx: (a.x + b.x) * 0.5 + dy * 0.12,
          cy: (a.y + b.y) * 0.5 - dx * 0.12,
          sameArtist: false,
        });
      }
    }

    const bgDust = Array.from({ length: 220 }, (_, i) => {
      const h = hashStr(`dust_${i}`);
      const layer = i % 3;
      return {
        x: (h % 1800) - 900,
        y: ((h >> 10) % 1300) - 650,
        r: 0.5 + layer * 0.4,
        alpha: 0.12 + (i % 5) * 0.08,
        phase: i * 0.37,
        depth: 0.22 + layer * 0.25,
      };
    });

    const labels = Array.from(artistCenters.values()).slice(0, 28);

    return { stars: nodes, edges: links, dust: bgDust, artistLabels: labels };
  }, [tracks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const drawSpikeStar = (
      x: number,
      y: number,
      r: number,
      color: string,
      alpha: number,
      rot: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      const len = r * 3.8;
      const thick = r * 0.38;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, len, thick, (k * Math.PI) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    let raf = 0;
    const draw = (now: number) => {
      const t = now * 0.001;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width;
      const h = canvas.height;
      const cam = camRef.current;

      cam.x += (cam.targetX - cam.x) * 0.12;
      cam.y += (cam.targetY - cam.y) * 0.12;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.12;

      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const nebulae = [
        {
          x: w * 0.32 + Math.sin(t * 0.18) * 38 * dpr + cam.x * 0.12 * dpr,
          y: h * 0.38 + Math.cos(t * 0.14) * 28 * dpr + cam.y * 0.12 * dpr,
          r: Math.min(w, h) * 0.52,
          c: `${coverPalette.primary}22`,
        },
        {
          x: w * 0.68 + Math.cos(t * 0.15) * 42 * dpr + cam.x * 0.12 * dpr,
          y: h * 0.62 + Math.sin(t * 0.21) * 32 * dpr + cam.y * 0.12 * dpr,
          r: Math.min(w, h) * 0.48,
          c: `${coverPalette.secondary}1E`,
        },
        {
          x: w * 0.5 + Math.sin(t * 0.11 + 2) * 30 * dpr + cam.x * 0.08 * dpr,
          y: h * 0.5 + Math.cos(t * 0.13 + 1) * 24 * dpr + cam.y * 0.08 * dpr,
          r: Math.min(w, h) * 0.62,
          c: "rgba(99, 102, 241, 0.08)",
        },
      ];
      for (const neb of nebulae) {
        const g = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
        g.addColorStop(0, neb.c);
        g.addColorStop(0.55, "rgba(15, 18, 32, 0.04)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();

      for (const d of dust) {
        const tw = 0.55 + 0.45 * Math.sin(t * 1.6 + d.phase);
        const px =
          w * 0.5 + (d.x + cam.x * d.depth + cam.mouseX * 12 * d.depth) * dpr;
        const py =
          h * 0.5 + (d.y + cam.y * d.depth + cam.mouseY * 12 * d.depth) * dpr;
        ctx.fillStyle = `rgba(255,255,255,${(d.alpha * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, d.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(w * 0.5 + cam.x * dpr, h * 0.5 + cam.y * dpr);
      ctx.scale(cam.zoom * dpr, cam.zoom * dpr);

      const hovId = hoveredIdRef.current;

      for (const link of edges) {
        const a = stars[link.a];
        const b = stars[link.b];
        const isHot =
          hovId !== null && (a.track.id === hovId || b.track.id === hovId);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(link.cx, link.cy, b.x, b.y);

        if (isHot) {
          ctx.strokeStyle = `${coverPalette.primary}AA`;
          ctx.lineWidth = 1.6 / cam.zoom;
          ctx.stroke();

          const pulseT = (t * 0.85 + link.a * 0.17) % 1;
          const inv = 1 - pulseT;
          const px = inv * inv * a.x + 2 * inv * pulseT * link.cx + pulseT * pulseT * b.x;
          const py = inv * inv * a.y + 2 * inv * pulseT * link.cy + pulseT * pulseT * b.y;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.arc(px, py, 2.1 / cam.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, link.sameArtist ? a.glowColor : "rgba(255,255,255,0.08)");
          grad.addColorStop(1, link.sameArtist ? b.glowColor : "rgba(255,255,255,0.06)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = (link.sameArtist ? 0.95 : 0.65) / cam.zoom;
          ctx.stroke();
        }
      }

      if (cam.zoom >= 1.08) {
        const labelAlpha = Math.min(0.65, (cam.zoom - 1.05) * 0.9);
        ctx.font = `600 ${Math.max(8, 10.5 / cam.zoom)}px "Space Grotesk", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(226, 232, 240, ${labelAlpha.toFixed(2)})`;
        for (const lbl of artistLabels) {
          ctx.fillText(lbl.name, lbl.x, lbl.y - 16 / cam.zoom);
        }
      }

      for (const st of stars) {
        const isCurrent = currentTrack?.id === st.track.id;
        const isHover = hovId === st.track.id;
        const pulse = 0.88 + 0.12 * Math.sin(t * 2.2 + st.phase);
        const r = st.radius * (isCurrent ? 1.5 : isHover ? 1.45 : 1) * pulse;
        const col = isCurrent ? coverPalette.primary : st.color;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const haloR = r * (isCurrent ? 6.2 : isHover ? 5.2 : st.track.liked ? 3.8 : 2.6);
        const halo = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, haloR);
        halo.addColorStop(0, isCurrent ? `${coverPalette.primary}99` : st.glowColor);
        halo.addColorStop(0.45, isCurrent ? `${coverPalette.secondary}33` : "rgba(255,255,255,0.05)");
        halo.addColorStop(1, "transparent");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(st.x, st.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        if (isCurrent || isHover || st.track.liked) {
          drawSpikeStar(
            st.x,
            st.y,
            r,
            isCurrent ? "#FFFFFF" : col,
            isCurrent ? 0.9 : isHover ? 0.85 : 0.45,
            isCurrent ? t * 0.35 : st.phase
          );
        }
        ctx.restore();

        ctx.fillStyle = isCurrent || isHover ? "#FFFFFF" : col;
        ctx.beginPath();
        ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
        ctx.fill();

        if (isCurrent) {
          ctx.save();
          ctx.strokeStyle = `${coverPalette.primary}CC`;
          ctx.lineWidth = 1.35 / cam.zoom;
          ctx.setLineDash([4 / cam.zoom, 4 / cam.zoom]);
          ctx.beginPath();
          ctx.arc(st.x, st.y, r * 2.7, t * 0.8, t * 0.8 + Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stars, edges, dust, artistLabels, currentTrack?.id, coverPalette.primary, coverPalette.secondary]);

  const findStarAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cam = camRef.current;
    const wx = (sx - rect.width * 0.5 - cam.x) / cam.zoom;
    const wy = (sy - rect.height * 0.5 - cam.y) / cam.zoom;

    let best: StarNode | null = null;
    let bestD2 = (20 / cam.zoom) ** 2;
    for (const st of stars) {
      const dx = st.x - wx;
      const dy = st.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = st;
      }
    }
    return best ? { star: best, screenX: sx, screenY: sy } : null;
  };

  const focusCurrentTrack = () => {
    if (!currentTrack) return;
    const found = stars.find((s) => s.track.id === currentTrack.id);
    if (found) {
      camRef.current.targetZoom = 1.65;
      camRef.current.targetX = -found.x * 1.65;
      camRef.current.targetY = -found.y * 1.65;
    }
  };

  const isRu = language === "ru";

  return (
    <div className="relative w-full h-[560px] rounded-3xl overflow-hidden border border-white/[0.08] bg-[#050507] select-none shadow-[inset_0_0_80px_rgba(0,0,0,0.9)]">
      {stars.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-sm">
          {isRu
            ? "Добавьте треки в библиотеку, чтобы увидеть созвездие"
            : "Add tracks to your library to explore the galaxy"}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            camRef.current.dragging = true;
            camRef.current.moved = false;
            camRef.current.lastX = e.clientX;
            camRef.current.lastY = e.clientY;
          }}
          onMouseMove={(e) => {
            const cam = camRef.current;
            const rect = e.currentTarget.getBoundingClientRect();
            cam.mouseX = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
            cam.mouseY = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;

            if (cam.dragging) {
              const dx = e.clientX - cam.lastX;
              const dy = e.clientY - cam.lastY;
              if (Math.abs(dx) > 2 || Math.abs(dy) > 2) cam.moved = true;
              cam.targetX += dx;
              cam.targetY += dy;
              cam.lastX = e.clientX;
              cam.lastY = e.clientY;
              setHoveredStar(null);
              hoveredIdRef.current = null;
              return;
            }
            const hit = findStarAt(e.clientX, e.clientY);
            hoveredIdRef.current = hit ? hit.star.track.id : null;
            setHoveredStar(hit);
          }}
          onMouseUp={(e) => {
            const wasMoved = camRef.current.moved;
            camRef.current.dragging = false;
            if (!wasMoved) {
              const hit = findStarAt(e.clientX, e.clientY);
              if (hit) {
                onPlayTrack(hit.star.track, tracks);
              }
            }
          }}
          onMouseLeave={() => {
            camRef.current.dragging = false;
            hoveredIdRef.current = null;
            setHoveredStar(null);
          }}
          onWheel={(e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 0.87;
            camRef.current.targetZoom = Math.min(
              2.9,
              Math.max(0.55, camRef.current.targetZoom * factor)
            );
          }}
        />
      )}

      <div className="absolute top-4 left-4 pointer-events-none flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/55 border border-white/[0.08] backdrop-blur-xl text-[11px] text-slate-300">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{
            backgroundColor: coverPalette.primary,
            boxShadow: `0 0 8px ${coverPalette.primary}`,
          }}
        />
        <span>
          {isRu
            ? `${stars.length} звёзд · тяни и приближай, клик — играть`
            : `${stars.length} stars · drag & zoom to explore, click to play`}
        </span>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-full bg-black/60 border border-white/[0.1] backdrop-blur-xl">
        {currentTrack && stars.some((s) => s.track.id === currentTrack.id) && (
          <button
            type="button"
            onClick={focusCurrentTrack}
            className="px-2.5 h-7 rounded-full text-[11px] font-medium text-white/85 hover:text-white hover:bg-white/[0.1] cursor-pointer"
          >
            {isRu ? "К треку" : "Focus"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            camRef.current.targetZoom = Math.min(2.9, camRef.current.targetZoom * 1.25);
          }}
          className="w-7 h-7 rounded-full text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.1] cursor-pointer"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            camRef.current.targetZoom = Math.max(0.55, camRef.current.targetZoom * 0.8);
          }}
          className="w-7 h-7 rounded-full text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.1] cursor-pointer"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            camRef.current.targetX = 0;
            camRef.current.targetY = 0;
            camRef.current.targetZoom = 1;
          }}
          className="px-2.5 h-7 rounded-full text-[11px] font-medium text-white/80 hover:text-white hover:bg-white/[0.1] cursor-pointer"
        >
          {isRu ? "Центр" : "Reset"}
        </button>
      </div>

      {hoveredStar && (
        <div
          className="pointer-events-none absolute z-20 flex items-center gap-2.5 p-2 pr-3 rounded-2xl awase-glass border border-white/[0.14] shadow-[0_16px_40px_rgba(0,0,0,0.85)] max-w-[250px]"
          style={{
            left: Math.min(Math.max(12, hoveredStar.screenX + 16), 580),
            top: Math.max(12, hoveredStar.screenY - 32),
          }}
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#121318] shrink-0 flex items-center justify-center">
            <CoverArt
              url={hoveredStar.star.track.coverUrl}
              alt=""
              fallback={
                <SourceIcon
                  source={SOURCE_META[hoveredStar.star.track.source].id}
                  size={16}
                />
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">
              {hoveredStar.star.track.title}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {hoveredStar.star.track.artist}
            </div>
          </div>
          <span style={{ color: coverPalette.primary }}>
            <IconPlay size={12} />
          </span>
        </div>
      )}
    </div>
  );
};
