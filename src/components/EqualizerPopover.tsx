import React from "react";
import type { AppLanguage, EqualizerState } from "../types";
import { TRANSLATIONS } from "../lib/i18n";
import { IconEqualizer, IconWinClose } from "./AwaseIcons";
import { EqFader } from "./EqFader";

interface EqualizerPopoverProps {
  open: boolean;
  language: AppLanguage;
  eqState: EqualizerState;
  onUpdate: (state: EqualizerState) => void;
  onClose: () => void;
}

const BAND_LABELS = ["60Hz", "230Hz", "910Hz", "3.6k", "14k"];

export const EQ_PRESETS: Array<{
  name: string;
  ruName: string;
  bands: [number, number, number, number, number];
}> = [
  { name: "Flat", ruName: "Ровный", bands: [0, 0, 0, 0, 0] },
  { name: "Warm", ruName: "Тёплый", bands: [3.5, 2.0, -0.5, 1.5, 2.5] },
  { name: "Bass", ruName: "Бас", bands: [6.0, 3.5, -1.0, 2.0, 3.5] },
  { name: "Electronic", ruName: "Электро", bands: [5.0, 2.0, -1.5, 2.5, 4.5] },
  { name: "Vocal", ruName: "Вокал", bands: [-2.0, 0.5, 4.5, 3.5, 1.5] },
  { name: "Acoustic", ruName: "Акустика", bands: [2.5, 1.0, 1.5, 2.5, 3.0] },
  { name: "Rock", ruName: "Рок", bands: [4.0, 1.5, -1.0, 3.0, 4.0] },
  { name: "Night", ruName: "Ночной", bands: [2.5, 1.0, 0.0, -1.5, -2.5] },
];

const isPresetActive = (
  bands: [number, number, number, number, number],
  preset: [number, number, number, number, number]
) => bands.every((v, i) => Math.abs(v - preset[i]) < 0.05);

function buildEqCurvePath(bands: [number, number, number, number, number], w: number, h: number) {
  const pts = bands.map((db, idx) => ({
    x: (idx / (bands.length - 1)) * w,
    y: h / 2 - (db / 12) * (h * 0.42),
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const mx = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C ${mx} ${p0.y.toFixed(1)}, ${mx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export const EqualizerPopover: React.FC<EqualizerPopoverProps> = ({
  open,
  language,
  eqState,
  onUpdate,
  onClose,
}) => {
  const t = TRANSLATIONS[language];
  const curveD = buildEqCurvePath(eqState.bands, 340, 44);

  return (
    <div
      className={`fixed right-6 bottom-28 z-50 w-[430px] rounded-2xl awase-glass border border-white/[0.12] shadow-2xl p-5 space-y-3.5 transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
          : "opacity-0 translate-y-3 scale-95 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconEqualizer size={18} className="text-cyanpulse" />
          <span className="text-sm font-semibold text-white">{t.eqTitle}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onUpdate({ ...eqState, bands: [0, 0, 0, 0, 0] })}
            className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            0 dB
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={eqState.enabled}
            onClick={() => onUpdate({ ...eqState, enabled: !eqState.enabled })}
            className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer"
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close equalizer"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.08] cursor-pointer"
          >
            <IconWinClose size={12} />
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[#0B0C10]/90 border border-white/[0.07] px-3 py-2">
        <svg viewBox="0 0 340 44" className="w-full h-11 overflow-visible">
          <defs>
            <linearGradient id="eqCurveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--awase-accent-rgb))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(var(--awase-accent-rgb))" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="22" x2="340" y2="22" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" strokeWidth="1" />
          <path d={`${curveD} L 340 44 L 0 44 Z`} fill="url(#eqCurveFill)" opacity={eqState.enabled ? 1 : 0.3} />
          <path
            d={curveD}
            fill="none"
            stroke="rgb(var(--awase-accent-rgb))"
            strokeWidth="2"
            strokeLinecap="round"
            opacity={eqState.enabled ? 1 : 0.35}
          />
        </svg>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {EQ_PRESETS.map((preset) => {
          const active = isPresetActive(eqState.bands, preset.bands);
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => onUpdate({ enabled: true, bands: preset.bands })}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                active
                  ? "bg-cyanpulse text-[#050507] shadow-sm"
                  : "bg-white/[0.07] hover:bg-white/[0.15] text-slate-200"
              }`}
            >
              {language === "ru" ? preset.ruName : preset.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-5 gap-2.5">
        {BAND_LABELS.map((label, idx) => (
          <EqFader
            key={label}
            label={label}
            value={eqState.bands[idx]}
            onChange={(nextVal) => {
              const next = [...eqState.bands] as [number, number, number, number, number];
              next[idx] = nextVal;
              onUpdate({ ...eqState, bands: next });
            }}
          />
        ))}
      </div>
    </div>
  );
};
