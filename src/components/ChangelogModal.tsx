import React from "react";
import type { AppLanguage } from "../types";
import { AwaseLogo } from "./AwaseIcons";

interface ChangelogModalProps {
  open: boolean;
  version: string;
  language: AppLanguage;
  onClose: () => void;
}

const ITEMS_RU = [
  {
    title: "8D Audio в реальном времени",
    desc: "Новый пространственный DSP-эффект в эквалайзере: плавное вращение звука на 360° вокруг головы с лёгкой реверберацией.",
  },
  {
    title: "Liquid Aurora («Жидкий шёлк»)",
    desc: "Новый WebGL-шейдер в Резонансе, переливающийся в цветах обложки с реакцией на бас и движение курсора.",
  },
  {
    title: "Кинетические тексты (Kinetic Lyrics Stage)",
    desc: "Режим музыкального клипа в окне текста: крупная типографика, пословная анимация и пульсация в такт биту (плюс убран лишний бейдж LRCLIB).",
  },
  {
    title: "Dynamic Island + Edge Glow",
    desc: "Мини-плеер переосмыслен в парящий островок у верхнего края экрана с живым спектром, раскрытием при наведении и неоновым свечением по контуру.",
  },
  {
    title: "Созвездие библиотеки (Galaxy Map)",
    desc: "Интерактивная карта треков в Awase Wrapped: звёздное скопление вашей музыки с туманностями, нитями созвездий, зумом и запуском по клику.",
  },
];

const ITEMS_EN = [
  {
    title: "Real-Time 8D Audio",
    desc: "New spatial DSP mode in the equalizer with smooth 360° orbit panning, subtle rear attenuation, and room reverb.",
  },
  {
    title: "Liquid Aurora WebGL Shader",
    desc: "New visualizer style in Resonance rendering GPU-accelerated liquid silk gradients that react to bass and cursor movement.",
  },
  {
    title: "Kinetic Lyrics Stage",
    desc: "Music-video typography mode in Lyrics with per-word kinetic emphasis and beat pulse (plus removed the LRCLIB source badge).",
  },
  {
    title: "Dynamic Island + Edge Glow",
    desc: "Redesigned Mini-Player as a top-centered floating island with live spectrum bars, hover-reveal controls, and bass-reactive Edge Glow.",
  },
  {
    title: "Interactive Galaxy Map",
    desc: "Explore your library as an interactive constellation inside Awase Wrapped — nebulae, glowing filaments, pan/zoom, and click any star to play.",
  },
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  open,
  version,
  language,
  onClose,
}) => {
  if (!open) return null;
  const items = language === "ru" ? ITEMS_RU : ITEMS_EN;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-[awaseViewEnter_420ms_cubic-bezier(0.22,1,0.36,1)_both]">
      <div
        className="relative w-full max-w-lg rounded-3xl border border-white/[0.12] bg-[#09090D] shadow-[0_32px_90px_rgba(0,0,0,0.9)] overflow-hidden p-6 space-y-5"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 10%, rgba(167,139,250,0.16), transparent 55%), radial-gradient(circle at 12% 90%, rgba(255,255,255,0.05), transparent 50%)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AwaseLogo size={38} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-white tracking-tight">
                  {language === "ru" ? "Что нового в Awase" : "What's New in Awase"}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-[#050507]">
                  v{version}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {language === "ru"
                  ? "Свежее обновление установлено и готово к работе"
                  : "Fresh update installed and ready to play"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 max-h-[54vh] overflow-y-auto awase-scroll pr-1">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white/[0.04] border border-white/[0.07] px-4 py-3 space-y-1 transition-colors hover:bg-white/[0.06]"
            >
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                <span>{item.title}</span>
              </div>
              <div className="text-[11.5px] text-slate-300 leading-relaxed pl-3.5">
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-white text-[#050507] hover:bg-white/90 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-[0_0_24px_rgba(255,255,255,0.2)]"
          >
            {language === "ru" ? "Продолжить" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
};
