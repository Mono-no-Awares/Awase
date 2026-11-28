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
    title: "Slowed + Reverb, Nightcore, Crossfade и Мини-плеер",
    desc: "DSP-эффекты в реальном времени прямо в эквалайзере, плавный Crossfade (0–8 сек) между треками и компактный плавающий мини-плеер поверх всех окон.",
  },
  {
    title: "Умная библиотека без лишних вкладок",
    desc: "Убрана вкладка All — в библиотеке отображаются только подключённые сервисы, а если ничего не добавлено, появляется быстрая карточка для подключения.",
  },
  {
    title: "Идеальная центровка и управление в Резонансе",
    desc: "Кнопка Play теперь всегда строго по центру, а кнопка добавления в плейлист аккуратно расположена справа от эквалайзера.",
  },
  {
    title: "Эквалайзер под цвет обложки",
    desc: "Кривая АЧХ и индикаторы эквалайзера теперь динамически меняют цвет под обложку текущего трека.",
  },
  {
    title: "Чистый нативный интерфейс",
    desc: "Отключены всплывающие браузерные подсказки при наведении на кнопки, убран Zapret (WinDivert), а Share Card и Awase Wrapped перенесены во Внешний вид.",
  },
  {
    title: "Авто-очистка кэша при старте",
    desc: "Треки не из избранного автоматически очищаются при каждом запуске (настраивается в Настройках).",
  },
];

const ITEMS_EN = [
  {
    title: "Slowed + Reverb, Nightcore, Crossfade & Mini-Player",
    desc: "Real-time DSP effects right inside the equalizer, smooth 0–8s track Crossfade, and a floating Always-on-Top Mini-Player.",
  },
  {
    title: "Smart, Clutter-Free Library",
    desc: "Removed the All tab — only connected sources are shown in the library, with a one-click prompt to connect services when empty.",
  },
  {
    title: "Centered Resonance Controls & Playlist Picker",
    desc: "The Play button is now strictly centered, and the Add to Playlist button sits cleanly to the right of the Equalizer.",
  },
  {
    title: "Cover-Adaptive Equalizer Curve",
    desc: "The equalizer's frequency response curve and accents now adapt dynamically to the current track's album art.",
  },
  {
    title: "Pure Native Desktop Feel",
    desc: "Removed native browser hover tooltips across all buttons, removed Zapret (WinDivert), and moved Share Card & Awase Wrapped into Appearance.",
  },
  {
    title: "Startup Cache Cleanup",
    desc: "Non-favorite cached audio tracks are automatically cleaned up on every startup (configurable in Settings).",
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
