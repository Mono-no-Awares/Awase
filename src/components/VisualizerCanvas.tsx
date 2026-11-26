import React, { useEffect, useRef } from "react";
import type { MiniVisualizerMode, VisualizerStyle } from "../types";

interface VisualizerCanvasProps {
  spectrum: number[];
  peak: number;
  isPlaying: boolean;
  accentColor: string;
  secondaryColor?: string;
  styleMode?: VisualizerStyle | "horizon";
  gamingMode?: boolean;
  className?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(226, 232, 240, ${alpha})`;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({
  spectrum,
  peak,
  isPlaying,
  accentColor,
  secondaryColor = "#A78BFA",
  styleMode = "aura",
  gamingMode = false,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef({
    spectrum,
    peak,
    isPlaying,
    accentColor,
    secondaryColor,
    styleMode,
    gamingMode,
  });

  dataRef.current = {
    spectrum,
    peak,
    isPlaying,
    accentColor,
    secondaryColor,
    styleMode,
    gamingMode,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (gamingMode) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let phase = 0;
    const smoothBars = new Array(40).fill(0);
    const particles = Array.from({ length: 26 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      r: 1.1 + (i % 4) * 0.65,
      speed: 0.00045 + (i % 5) * 0.00018,
      drift: (i % 7) * 0.9,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      animId = requestAnimationFrame(draw);
      const {
        spectrum: spec,
        peak: pk,
        isPlaying: playing,
        accentColor: accent,
        secondaryColor: secondary,
        styleMode: mode,
        gamingMode: gaming,
      } = dataRef.current;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      if (document.hidden || gaming) {
        if (gaming) ctx.clearRect(0, 0, width, height);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const n = smoothBars.length;
      let bass = 0;
      let mid = 0;
      let treble = 0;

      for (let i = 0; i < n; i++) {
        const idx = Math.floor((i / n) * spec.length);
        const raw = playing ? spec[idx] ?? 0 : 0.03 + 0.02 * Math.sin(phase * 1.4 + i * 0.35);
        smoothBars[i] += (raw - smoothBars[i]) * (playing ? 0.22 : 0.08);
        if (i < 10) bass += smoothBars[i];
        else if (i < 24) mid += smoothBars[i];
        else treble += smoothBars[i];
      }

      bass /= 10;
      mid /= 14;
      treble /= 16;

      const tempoBoost = playing ? bass * 0.045 + pk * 0.025 : 0;
      const energy = playing ? Math.max(pk, (bass + mid) * 0.58) : 0.08;
      phase += playing ? 0.015 + tempoBoost : 0.005;

      if (mode === "horizon") {
        const layers = 3;
        for (let l = 0; l < layers; l++) {
          ctx.beginPath();
          const baseY = height * (0.58 + l * 0.11);
          const amp = (14 + energy * 46) * (1 - l * 0.22);
          ctx.moveTo(0, height);
          for (let x = 0; x <= width; x += 12) {
            const norm = x / width;
            const bIdx = Math.min(n - 1, Math.floor(norm * n));
            const wave =
              Math.sin(norm * 5.2 + phase * (1 + l * 0.28)) * amp +
              Math.cos(norm * 10.5 - phase * 1.3) * (amp * 0.32) +
              smoothBars[bIdx] * 26;
            ctx.lineTo(x, baseY + wave);
          }
          ctx.lineTo(width, height);
          ctx.closePath();

          const grad = ctx.createLinearGradient(0, baseY - amp, width, height);
          grad.addColorStop(0, hexToRgba(l % 2 === 0 ? accent : secondary, 0.22 - l * 0.05));
          grad.addColorStop(1, "rgba(5, 5, 7, 0)");
          ctx.fillStyle = grad;
          ctx.fill();
        }
        return;
      }

      const cx = width * 0.5;
      const cy = height * 0.45;
      const baseRadius = Math.min(width, height) * 0.22;

      if (mode === "silk") {
        const ribbonCount = 5;
        for (let r = 0; r < ribbonCount; r++) {
          const offset = r * 0.55;
          const baseY = height * (0.34 + r * 0.095);
          const amp = (22 + bass * 68 + mid * 42) * (1 - r * 0.12);

          ctx.beginPath();
          for (let x = 0; x <= width; x += 8) {
            const norm = x / width;
            const bIdx = Math.min(n - 1, Math.floor(norm * n));
            const envelope = Math.sin(norm * Math.PI);
            const y =
              baseY +
              Math.sin(norm * 4.5 + phase * (1.1 + r * 0.14) + offset) * amp * envelope +
              Math.cos(norm * 9.0 - phase * 0.8 + offset) * (amp * 0.36) * envelope +
              (smoothBars[bIdx] - 0.1) * 32 * envelope * (r % 2 === 0 ? 1 : -1);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          const lineGrad = ctx.createLinearGradient(0, baseY - amp, width, baseY + amp);
          lineGrad.addColorStop(0, hexToRgba(accent, 0));
          lineGrad.addColorStop(0.25, hexToRgba(r % 2 === 0 ? accent : secondary, 0.58 - r * 0.08));
          lineGrad.addColorStop(0.5, hexToRgba("#FFFFFF", 0.45 - r * 0.07));
          lineGrad.addColorStop(0.75, hexToRgba(r % 2 === 0 ? secondary : accent, 0.58 - r * 0.08));
          lineGrad.addColorStop(1, hexToRgba(secondary, 0));

          ctx.strokeStyle = lineGrad;
          ctx.lineWidth = 2.6 - r * 0.3;
          ctx.shadowColor = r % 2 === 0 ? accent : secondary;
          ctx.shadowBlur = 16;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        for (const p of particles) {
          p.y -= p.speed * (1 + energy * 4.5);
          if (p.y < -0.05) p.y = 1.05;
          const px = (p.x + Math.sin(phase * 0.6 + p.drift) * 0.02) * width;
          const py = p.y * height;
          ctx.beginPath();
          ctx.arc(px, py, p.r * (1 + treble * 0.8), 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(p.drift > 3 ? secondary : accent, 0.25 + energy * 0.4);
          ctx.fill();
        }
        return;
      }

      if (mode === "orbital") {
        const aura = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * 2.4);
        aura.addColorStop(0, hexToRgba(accent, 0.14 + bass * 0.18));
        aura.addColorStop(0.55, hexToRgba(secondary, 0.07 + mid * 0.1));
        aura.addColorStop(1, "rgba(5, 5, 7, 0)");
        ctx.fillStyle = aura;
        ctx.fillRect(0, 0, width, height);

        const rings = [
          { rMult: 0.92, speed: 0.55, nodes: 8, color: accent, width: 1.6, react: bass },
          { rMult: 1.24, speed: -0.38, nodes: 12, color: secondary, width: 1.3, react: mid },
          { rMult: 1.58, speed: 0.24, nodes: 16, color: accent, width: 1.0, react: treble },
        ];

        for (let ri = 0; ri < rings.length; ri++) {
          const ring = rings[ri];
          const rad = baseRadius * ring.rMult + ring.react * 22;

          ctx.beginPath();
          for (let a = 0; a <= 96; a++) {
            const theta = (a / 96) * Math.PI * 2;
            const bIdx = Math.floor((a / 96) * n) % n;
            const ripple = Math.sin(theta * 4 + phase * (ri + 1.5)) * (4 + smoothBars[bIdx] * 14);
            const rr = rad + ripple;
            const px = cx + Math.cos(theta) * rr;
            const py = cy + Math.sin(theta) * rr;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = hexToRgba(ring.color, 0.26 + ring.react * 0.35);
          ctx.lineWidth = ring.width;
          ctx.stroke();

          for (let k = 0; k < ring.nodes; k++) {
            const theta = (k / ring.nodes) * Math.PI * 2 + phase * ring.speed;
            const bIdx = (k * 3 + ri * 5) % n;
            const pulse = smoothBars[bIdx];
            const rr = rad + Math.sin(theta * 4 + phase * (ri + 1.5)) * (4 + pulse * 14);
            const nx = cx + Math.cos(theta) * rr;
            const ny = cy + Math.sin(theta) * rr;

            ctx.beginPath();
            ctx.arc(nx, ny, 2.1 + pulse * 3.8, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(ring.color, 0.65 + pulse * 0.35);
            ctx.shadowColor = ring.color;
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
        return;
      }

      const bgGlow = ctx.createRadialGradient(cx, cy, baseRadius * 0.15, cx, cy, baseRadius * 2.8);
      bgGlow.addColorStop(0, hexToRgba(accent, 0.28 + bass * 0.3));
      bgGlow.addColorStop(0.45, hexToRgba(secondary, 0.14 + mid * 0.16));
      bgGlow.addColorStop(1, "rgba(5, 5, 7, 0)");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, width, height);

      const spokes = 48;
      for (let s = 0; s < spokes; s++) {
        const theta = (s / spokes) * Math.PI * 2 + phase * 0.22;
        const bVal = smoothBars[s % n];
        const innerR = baseRadius * 0.84 + bass * 10;
        const outerR = innerR + 8 + bVal * (38 + pk * 26);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(theta) * innerR, cy + Math.sin(theta) * innerR);
        ctx.lineTo(cx + Math.cos(theta) * outerR, cy + Math.sin(theta) * outerR);
        ctx.strokeStyle = hexToRgba(s % 2 === 0 ? accent : secondary, 0.18 + bVal * 0.55);
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      for (let ring = 0; ring < 4; ring++) {
        ctx.beginPath();
        const dir = ring % 2 === 0 ? 1 : -1;
        const rBase = baseRadius * (0.88 + ring * 0.21) + bass * (18 - ring * 2);
        const points = 96;
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const bIdx = Math.floor(((i % points) / points) * n);
          const amp = smoothBars[bIdx] * (20 + ring * 8);
          const harmonic =
            Math.sin(angle * (4 + ring * 2) + phase * dir * (1.2 + ring * 0.35)) *
              (5 + energy * 12) +
            Math.cos(angle * 7 - phase * dir * 0.9) * (3 + treble * 10);
          const r = rBase + amp + harmonic;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const ringColor = ring % 2 === 0 ? accent : secondary;
        ctx.strokeStyle = hexToRgba(ringColor, 0.52 - ring * 0.09);
        ctx.lineWidth = 2.1 - ring * 0.28;
        ctx.shadowColor = ringColor;
        ctx.shadowBlur = ring < 2 ? 12 : 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      for (let p = 0; p < 16; p++) {
        const angle = (p / 16) * Math.PI * 2 + phase * (p % 2 === 0 ? 0.45 : -0.32);
        const dist = baseRadius * (1.35 + (p % 3) * 0.32) + Math.sin(phase * 2 + p) * 10 + bass * 20;
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + treble * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(p % 2 === 0 ? accent : secondary, 0.35 + energy * 0.45);
        ctx.fill();
      }
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [gamingMode]);

  return <canvas ref={canvasRef} className={`w-full h-full block ${className}`} />;
};

export const MiniSpectrumStrip: React.FC<{
  spectrum: number[];
  isPlaying: boolean;
  accentColor: string;
  mode: MiniVisualizerMode;
  gamingMode?: boolean;
}> = ({ spectrum, isPlaying, accentColor, mode, gamingMode = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ spectrum, isPlaying, accentColor, mode, gamingMode });
  stateRef.current = { spectrum, isPlaying, accentColor, mode, gamingMode };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (gamingMode) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let phase = 0;
    const bars = new Array(32).fill(0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      animId = requestAnimationFrame(draw);
      const {
        spectrum: spec,
        isPlaying: playing,
        accentColor: accent,
        mode: vizMode,
        gamingMode: gaming,
      } = stateRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;

      if (document.hidden || gaming || vizMode === "off") {
        ctx.clearRect(0, 0, w, h);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      phase += playing ? 0.05 : 0.015;
      for (let i = 0; i < bars.length; i++) {
        const target = playing ? spec[i] ?? 0 : 0.04;
        bars[i] += (target - bars[i]) * 0.25;
      }

      if (vizMode === "wave") {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < bars.length; i++) {
          const x = (i / (bars.length - 1)) * w;
          const val = bars[i];
          const y = h - Math.max(3, val * h * 0.85 + Math.sin(phase + i * 0.4) * (playing ? 3 : 0.5));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, hexToRgba(accent, 0.52));
        grad.addColorStop(1, hexToRgba(accent, 0.03));
        ctx.fillStyle = grad;
        ctx.fill();
        return;
      }

      const gap = 3;
      const barW = Math.max(2, (w - gap * (bars.length - 1)) / bars.length);
      for (let i = 0; i < bars.length; i++) {
        const barH = Math.max(2, bars[i] * h * 0.85);
        const x = i * (barW + gap);
        const y = h - barH;
        ctx.fillStyle = hexToRgba(accent, playing ? 0.55 : 0.16);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [gamingMode]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};
