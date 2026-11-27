import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppLanguage } from "../types";
import { TRANSLATIONS } from "../lib/i18n";
import {
  AwaseLogo,
  IconBolt,
  IconFullscreen,
  IconSearch,
  IconWinClose,
  IconWinMax,
  IconWinMin,
} from "./AwaseIcons";

interface TitleBarProps {
  language: AppLanguage;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  isSearching: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  gamingMode: boolean;
  onToggleGamingMode: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  language,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  isSearching,
  isFullscreen,
  onToggleFullscreen,
  gamingMode,
  onToggleGamingMode,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const t = TRANSLATIONS[language];

  const expanded = searchOpen || searchQuery.length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 40);
      } else if (e.key === "Escape" && searchOpen && !searchQuery) {
        setSearchOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, searchQuery]);

  const handleDragMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea")) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea")) return;
    getCurrentWindow().toggleMaximize().catch(() => {});
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleDragMouseDown}
      onDoubleClick={handleHeaderDoubleClick}
      className="h-14 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center px-4 border-b border-white/[0.07] bg-[#0A0B0E]/95 backdrop-blur-xl z-40"
    >
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <AwaseLogo size={26} />
        <span className="font-display font-semibold tracking-wide text-base text-white">
          Awase
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit(searchQuery);
        }}
        className="flex items-center justify-center"
      >
        <div
          className={`relative flex items-center overflow-hidden rounded-full border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            expanded
              ? "w-72 sm:w-96 h-8 bg-white/[0.07] border-white/[0.16] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
              : "w-56 sm:w-64 h-8 bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07]"
          }`}
        >
          {expanded ? (
            <>
              <span className="w-8 h-8 shrink-0 flex items-center justify-center text-slate-400 pointer-events-none">
                <IconSearch size={14} />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onBlur={() => {
                  if (!searchQuery.trim()) setSearchOpen(false);
                }}
                placeholder={t.searchPlaceholder}
                className="flex-1 h-8 bg-transparent pr-8 text-xs text-white placeholder:text-slate-400/75 focus:outline-none"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isSearching ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSearchChange("");
                      setSearchOpen(false);
                    }}
                    aria-label="Close search"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <IconWinClose size={10} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSearchOpen(true);
                window.setTimeout(() => inputRef.current?.focus(), 60);
              }}
              aria-label="Search"
              className="w-full h-full flex items-center px-3 gap-2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <IconSearch size={14} className="shrink-0" />
              <span className="text-xs truncate">{t.searchPlaceholder}</span>
            </button>
          )}
        </div>
      </form>

      <div className="flex items-center gap-1 justify-end">
        <button
          type="button"
          onClick={onToggleGamingMode}
          aria-label={t.gamingModeLabel}
          className={`h-7 px-2.5 mr-1 flex items-center gap-1.5 rounded-full border text-[11px] font-medium transition-all duration-200 active:scale-95 cursor-pointer ${
            gamingMode
              ? "bg-white border-white text-[#050507] shadow-[0_0_16px_rgba(255,255,255,0.28)]"
              : "bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-white/[0.08]"
          }`}
        >
          <IconBolt size={13} />
          <span className="hidden md:inline">{t.gamingModeLabel}</span>
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={t.fullscreen}
          className={`w-9 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
            isFullscreen
              ? "text-white bg-white/[0.14]"
              : "text-slate-300 hover:text-white hover:bg-white/[0.09]"
          }`}
        >
          <IconFullscreen size={14} active={isFullscreen} />
        </button>
        <button
          type="button"
          onClick={() => getCurrentWindow().minimize().catch(() => {})}
          aria-label="Minimize window"
          className="w-9 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.09] transition-colors cursor-pointer"
        >
          <IconWinMin size={12} />
        </button>
        <button
          type="button"
          onClick={() => getCurrentWindow().toggleMaximize().catch(() => {})}
          aria-label="Maximize window"
          className="w-9 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.09] transition-colors cursor-pointer"
        >
          <IconWinMax size={12} />
        </button>
        <button
          type="button"
          onClick={() => getCurrentWindow().close().catch(() => {})}
          aria-label="Hide to tray"
          className="w-9 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-rose-500/85 transition-colors cursor-pointer"
        >
          <IconWinClose size={12} />
        </button>
      </div>
    </header>
  );
};
