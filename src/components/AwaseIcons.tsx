import React from "react";
import type { SourceKind } from "../types";
import yandexPng from "../assets/icons/yandex.png";
import spotifyPng from "../assets/icons/spotify.png";
import soundcloudPng from "../assets/icons/soundcloud.png";

interface IconProps {
  className?: string;
  size?: number;
}

export const AwaseLogo: React.FC<IconProps> = ({ className = "", size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    fill="none"
    shapeRendering="geometricPrecision"
    className={className}
  >
    <rect
      x="1.5"
      y="1.5"
      width="33"
      height="33"
      rx="9.5"
      fill="#101218"
      stroke="rgba(255,255,255,0.16)"
      strokeWidth="1.2"
    />
    <path
      d="M18 7.5L9 27H13L18 15.8V7.5Z"
      fill="#F8FAFC"
    />
    <path
      d="M18 7.5L27 27H23L18 15.8V7.5Z"
      fill="#C4B5FD"
    />
    <rect x="13" y="20.6" width="10" height="2.4" rx="1.2" fill="#FFFFFF" />
    <circle cx="18" cy="17.2" r="2.1" fill="#A78BFA" />
  </svg>
);

export const IconStage: React.FC<IconProps> = ({ className = "", size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M3.5 10.5L12 3.5L20.5 10.5V19.5C20.5 20.1 20.1 20.5 19.5 20.5H14.5V14.5H9.5V20.5H4.5C3.9 20.5 3.5 20.1 3.5 19.5V10.5Z"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconResonance: React.FC<IconProps> = ({ className = "", size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.75" strokeOpacity="0.45" />
    <circle cx="12" cy="12" r="4.8" stroke="currentColor" strokeWidth="1.85" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
  </svg>
);

export const IconLibrary: React.FC<IconProps> = ({ className = "", size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <rect x="4" y="4.5" width="4" height="15" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
    <rect x="10" y="4.5" width="4" height="15" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M16.2 5.5L20.5 19" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" />
  </svg>
);

export const IconSources: React.FC<IconProps> = ({ className = "", size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 3.5V6M12 18V20.5M3.5 12H6M18 12H20.5M6 6L7.8 7.8M16.2 16.2L18 18M18 6L16.2 7.8M7.8 16.2L6 18"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const IconPlay: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" shapeRendering="geometricPrecision" className={className}>
    <path d="M7.5 5.2C7.5 4.4 8.4 3.9 9.1 4.3L19.4 10.9C20.1 11.3 20.1 12.4 19.4 12.8L9.1 19.4C8.4 19.8 7.5 19.3 7.5 18.5V5.2Z" />
  </svg>
);

export const IconPause: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" shapeRendering="geometricPrecision" className={className}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.4" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.4" />
  </svg>
);

export const IconPrev: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" shapeRendering="geometricPrecision" className={className}>
    <rect x="5" y="5.5" width="2.4" height="13" rx="1.2" />
    <path d="M18.2 6.2C18.2 5.4 17.3 5 16.6 5.4L8.8 11.1C8.2 11.5 8.2 12.5 8.8 12.9L16.6 18.6C17.3 19 18.2 18.6 18.2 17.8V6.2Z" />
  </svg>
);

export const IconNext: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" shapeRendering="geometricPrecision" className={className}>
    <rect x="16.6" y="5.5" width="2.4" height="13" rx="1.2" />
    <path d="M5.8 6.2C5.8 5.4 6.7 5 7.4 5.4L15.2 11.1C15.8 11.5 15.8 12.5 15.2 12.9L7.4 18.6C6.7 19 5.8 18.6 5.8 17.8V6.2Z" />
  </svg>
);

export const IconShuffle: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M4 7.5H8.5L15.5 16.5H20M20 7.5H15.5L13.5 10M4 16.5H8.5L10.5 14"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M17.5 5.2L20 7.5L17.5 9.8M17.5 14.2L20 16.5L17.5 18.8" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconRepeat: React.FC<IconProps & { one?: boolean }> = ({
  className = "",
  size = 18,
  one = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M17 4.5L19.5 7L17 9.5M7 19.5L4.5 17L7 14.5"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.5 7H8.5C6.3 7 4.5 8.8 4.5 11V11.5M4.5 17H15.5C17.7 17 19.5 15.2 19.5 13V12.5"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {one && <circle cx="12" cy="12" r="2.2" fill="currentColor" />}
  </svg>
);

export const IconVolume: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M4.5 9.5H8L13.5 5V19L8 14.5H4.5V9.5Z" fill="currentColor" />
    <path d="M16.5 9C17.8 10.7 17.8 13.3 16.5 15" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
    <path d="M19 6.5C21.2 9.6 21.2 14.4 19 17.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeOpacity="0.65" />
  </svg>
);

export const IconMute: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M4.5 9.5H8L13.5 5V19L8 14.5H4.5V9.5Z" fill="currentColor" />
    <path d="M16.5 9.5L21 14.5M21 9.5L16.5 14.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const IconHeart: React.FC<IconProps & { filled?: boolean }> = ({
  className = "",
  size = 18,
  filled = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M12 20L4.8 13.1C3.2 11.4 3.2 8.4 5 6.8C6.6 5.3 9.1 5.6 10.6 7.2L12 8.7L13.4 7.2C14.9 5.6 17.4 5.3 19 6.8C20.8 8.4 20.8 11.4 19.2 13.1L12 20Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconSearch: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.9" />
    <path d="M15.2 15.2L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconEqualizer: React.FC<IconProps> = ({ className = "", size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M6 5V19M12 5V19M18 5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.45" />
    <circle cx="6" cy="9" r="2.4" fill="currentColor" />
    <circle cx="12" cy="15" r="2.4" fill="currentColor" />
    <circle cx="18" cy="8" r="2.4" fill="currentColor" />
  </svg>
);

export const IconQueue: React.FC<IconProps> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M4 6.5H19.5M4 11.5H19.5M11.5 16.5H19.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M4.2 14.5L8.6 17L4.2 19.5V14.5Z" fill="currentColor" />
  </svg>
);

export const IconFolder: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M3.5 6.5H9.5L11.5 8.8H20.5V18.5H3.5V6.5Z"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconLink: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M10.5 13.5L13.5 10.5M9.5 16.5L7.5 18.5C5.8 20.2 3.8 18.2 5.5 16.5L7.5 14.5M14.5 7.5L16.5 5.5C18.2 3.8 20.2 5.8 18.5 7.5L16.5 9.5"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
    />
  </svg>
);

export const IconRefresh: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M19 8.5C17.6 5.9 14.9 4.5 12 4.5C7.9 4.5 4.5 7.9 4.5 12C4.5 16.1 7.9 19.5 12 19.5C15.5 19.5 18.4 17.1 19.2 13.9"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
    />
    <path d="M19.5 4.5V9H15" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconPlus: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconMinus: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M5.5 12H18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconBolt: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path
      d="M13.2 2.8L5.5 13.4H11.4L10.4 21.2L18.5 10.6H12.6L13.2 2.8Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconPlaylistAdd: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M4 7H15.5M4 11.5H15.5M4 16H11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M16.5 13V19M13.5 16H19.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const IconTrash: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M5 7H19M9.5 7V4.5H14.5V7M7.5 7L8.5 19.5H15.5L16.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCheck: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M5.5 12.5L10 17L18.5 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconDevice: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <rect x="6" y="3.5" width="12" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="14" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
  </svg>
);

export const IconChevronDown: React.FC<IconProps> = ({ className = "", size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconFullscreen: React.FC<IconProps & { active?: boolean }> = ({
  className = "",
  size = 15,
  active = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" shapeRendering="geometricPrecision" className={className}>
    {active ? (
      <path d="M5.5 2.5V5.5H2.5M10.5 2.5V5.5H13.5M13.5 10.5H10.5V13.5M2.5 10.5H5.5V13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="M2.5 6V2.5H6M10 2.5H13.5V6M13.5 10V13.5H10M6 13.5H2.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

export const IconWinMin: React.FC<IconProps> = ({ className = "", size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M2 6H10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconLyrics: React.FC<IconProps> = ({ className = "", size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M5 7H19M5 12H15M5 17H11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="17.5" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M20 16.5V10.5L17 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconWinMax: React.FC<IconProps> = ({ className = "", size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" shapeRendering="geometricPrecision" className={className}>
    <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const IconWinClose: React.FC<IconProps> = ({ className = "", size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" shapeRendering="geometricPrecision" className={className}>
    <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconSourceLocal: React.FC<IconProps> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="geometricPrecision" className={className}>
    <circle cx="12" cy="12" r="10" fill="#181B24" stroke="#E2E8F0" strokeWidth="1.4" strokeOpacity="0.45" />
    <path d="M7 12H9.2L11 7.8L13.2 16.2L15 12H17" stroke="#F8FAFC" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconSourceYandex: React.FC<IconProps> = ({ className = "", size = 20 }) => (
  <img
    src={yandexPng}
    alt="Yandex Music"
    width={size}
    height={size}
    draggable={false}
    className={`object-contain select-none pointer-events-none shrink-0 ${className}`}
    style={{ width: size, height: size }}
  />
);

export const IconSourceSpotify: React.FC<IconProps> = ({ className = "", size = 20 }) => (
  <img
    src={spotifyPng}
    alt="Spotify"
    width={size}
    height={size}
    draggable={false}
    className={`object-contain select-none pointer-events-none shrink-0 ${className}`}
    style={{ width: size, height: size }}
  />
);

export const IconSourceSoundCloud: React.FC<IconProps> = ({ className = "", size = 20 }) => (
  <img
    src={soundcloudPng}
    alt="SoundCloud"
    width={size}
    height={size}
    draggable={false}
    className={`object-contain select-none pointer-events-none shrink-0 ${className}`}
    style={{ width: size, height: size }}
  />
);

export const SourceIcon: React.FC<{ source: SourceKind; size?: number; className?: string }> = ({
  source,
  size = 20,
  className = "",
}) => {
  switch (source) {
    case "local":
      return <IconSourceLocal size={size} className={className} />;
    case "yandex":
      return <IconSourceYandex size={size} className={className} />;
    case "spotify":
      return <IconSourceSpotify size={size} className={className} />;
    case "soundcloud":
      return <IconSourceSoundCloud size={size} className={className} />;
  }
};
