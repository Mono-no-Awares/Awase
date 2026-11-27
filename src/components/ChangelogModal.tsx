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
    title: "Spotify Premium через Web Playback SDK",
    desc: "Прямое воспроизведение 1-в-1, вход в 1 клик без Client ID и полная синхронизация плейлистов (>100 треков).",
  },
  {
    title: "Умный Discord Rich Presence",
    desc: "Настраиваемые стили (Minimal, Detailed, Audiophile, Live Lyrics), статус Idle по активному экрану, скрытие на паузе и кнопки.",
  },
  {
    title: "Усовершенствованный 5-полосный эквалайзер",
    desc: "Музыкальные полки low/high-shelf, живая SVG-кривая АЧХ, 8 пресетов, сброс 0 dB и регулировка колёсиком мыши.",
  },
  {
    title: "Градиентная тема, плавная перемотка и авто-кэш",
    desc: "Новый режим Ambient Gradient, добавление в плейлисты из Резонанса, авто-очистка не-избранного кэша при старте и фикс Gaming Mode.",
  },
];

const ITEMS_EN = [
  {
    title: "Spotify Premium via Web Playback SDK",
    desc: "Direct 1:1 playback, 1-click account login without Client ID, and full playlist (>100 tracks) & likes sync.",
  },
  {
    title: "Smart Discord Rich Presence",
    desc: "4 display styles (Minimal, Detailed, Audiophile, Live Lyrics), view-aware Idle status, hide-on-pause toggle, and profile buttons.",
  },
  {
    title: "Upgraded 5-Band Equalizer",
    desc: "Musical low/high-shelf filters, live SVG frequency curve, 8 presets, 0 dB quick reset, and mouse wheel control.",
  },
  {
    title: "Ambient Gradient Theme & Polish",
    desc: "Optional cover-reactive Ambient Gradient theme, Resonance playlist picker, auto-clean non-favorite cache on startup, and Gaming Mode fixes.",
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
