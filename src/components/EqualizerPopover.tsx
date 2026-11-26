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

const PRESETS: Array<{ name: string; bands: [number, number, number, number, number] }> = [
  { name: "Flat", bands: [0, 0, 0, 0, 0] },
  { name: "Warm", bands: [3.5, 2.0, -0.5, 1.5, 2.5] },
  { name: "Bass", bands: [6.0, 3.5, -1.0, 2.0, 4.0] },
  { name: "Vocal", bands: [-2.0, 0.5, 4.5, 3.5, 1.5] },
  { name: "Night", bands: [2.5, 1.0, 0.0, -1.5, -2.5] },
];

export const EqualizerPopover: React.FC<EqualizerPopoverProps> = ({
  open,
  language,
  eqState,
  onUpdate,
  onClose,
}) => {
  const t = TRANSLATIONS[language];

  return (
    <div
      className={`fixed right-6 bottom-28 z-50 w-[410px] rounded-2xl awase-glass border border-white/[0.12] shadow-2xl p-5 space-y-4 transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
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

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => onUpdate({ enabled: true, bands: preset.bands })}
            className="px-3 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.15] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
          >
            {preset.name}
          </button>
        ))}
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
