import React, { useRef } from "react";

interface EqFaderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export const EqFader: React.FC<EqFaderProps> = ({ label, value, onChange }) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const db = Math.round((ratio * 24 - 12) * 2) / 2;
    onChange(db);
  };

  const pct = ((value + 12) / 24) * 100;
  const centerDiff = pct - 50;

  return (
    <div className="flex flex-col items-center gap-2 p-2.5 rounded-xl bg-[#0B0C10] border border-white/[0.07]">
      <span className="text-[11px] font-semibold text-cyanpulse tabular-nums">
        {value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
      </span>

      <div
        ref={trackRef}
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          updateFromPointer(e.clientY);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromPointer(e.clientY);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onDoubleClick={() => onChange(0)}
        title="Double-click to reset 0 dB"
        className="relative h-28 w-8 flex items-center justify-center cursor-pointer touch-none"
      >
        <div className="w-1.5 h-full rounded-full bg-white/[0.1]" />
        <div className="absolute left-1.5 right-1.5 top-1/2 h-[1px] bg-white/[0.25] pointer-events-none" />

        <div
          className="absolute w-1.5 rounded-full bg-cyanpulse pointer-events-none"
          style={{
            bottom: centerDiff >= 0 ? "50%" : `${pct}%`,
            height: `${Math.abs(centerDiff)}%`,
          }}
        />

        <div
          className="absolute w-4 h-4 rounded-full bg-white border-2 border-cyanpulse shadow-md pointer-events-none transition-transform duration-75"
          style={{ bottom: `calc(${pct}% - 8px)` }}
        />
      </div>

      <span className="text-[11px] font-medium text-slate-300">{label}</span>
    </div>
  );
};
