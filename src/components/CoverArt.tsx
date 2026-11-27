import React, { useEffect, useState } from "react";
import { api } from "../lib/ipc";

const coverDataCache = new Map<string, string>();
const inFlightCovers = new Map<string, Promise<string>>();

function loadSoundcloudCover(url: string): Promise<string> {
  const cached = coverDataCache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = inFlightCovers.get(url);
  if (existing) return existing;

  const p = api
    .fetchCoverCached(url)
    .then((dataUrl) => {
      coverDataCache.set(url, dataUrl);
      inFlightCovers.delete(url);
      return dataUrl;
    })
    .catch((err) => {
      inFlightCovers.delete(url);
      throw err;
    });
  inFlightCovers.set(url, p);
  return p;
}

interface CoverArtProps {
  url: string | null | undefined;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
}

export const CoverArt: React.FC<CoverArtProps> = ({
  url,
  alt = "",
  className = "w-full h-full object-cover",
  fallback = null,
}) => {
  const isSc = Boolean(url && url.includes("sndcdn.com"));
  const [src, setSrc] = useState<string | null>(() => {
    if (!url) return null;
    if (isSc) return coverDataCache.get(url) ?? null;
    return url;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!url) {
      setSrc(null);
      return;
    }
    if (!url.includes("sndcdn.com")) {
      setSrc(url);
      return;
    }
    const cached = coverDataCache.get(url);
    if (cached) {
      setSrc(cached);
      return;
    }
    setSrc(null);
    let cancelled = false;
    loadSoundcloudCover(url)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(url);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!src || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (src.includes("-t500x500")) {
          setSrc(src.replace("-t500x500", "-large"));
        } else {
          setFailed(true);
        }
      }}
      className={className}
    />
  );
};
