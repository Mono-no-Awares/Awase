export interface CoverPalette {
  primary: string;
  secondary: string;
  glow: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function boostVibrancy(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 45) {
    return [56, 189, 248];
  }
  const avg = (r + g + b) / 3;
  const satBoost = max - min < 28 ? 1.35 : 1.18;
  const nr = Math.min(255, Math.max(30, avg + (r - avg) * satBoost));
  const ng = Math.min(255, Math.max(30, avg + (g - avg) * satBoost));
  const nb = Math.min(255, Math.max(30, avg + (b - avg) * satBoost));
  return [nr, ng, nb];
}

export async function extractCoverPalette(
  coverUrl: string | null | undefined,
  fallbackPrimary: string,
  fallbackSecondary = "#818CF8"
): Promise<CoverPalette> {
  if (!coverUrl) {
    return {
      primary: fallbackPrimary,
      secondary: fallbackSecondary,
      glow: `${fallbackPrimary}55`,
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    if (!coverUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    const timer = window.setTimeout(() => {
      resolve({
        primary: fallbackPrimary,
        secondary: fallbackSecondary,
        glow: `${fallbackPrimary}55`,
      });
    }, 1400);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no ctx");
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;

        let r1 = 0;
        let g1 = 0;
        let b1 = 0;
        let c1 = 0;
        let r2 = 0;
        let g2 = 0;
        let b2 = 0;
        let c2 = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max - min;
          if (max > 35 && max < 245) {
            if (i < data.length / 2) {
              const weight = 1 + sat / 64;
              r1 += r * weight;
              g1 += g * weight;
              b1 += b * weight;
              c1 += weight;
            } else {
              const weight = 1 + sat / 64;
              r2 += r * weight;
              g2 += g * weight;
              b2 += b * weight;
              c2 += weight;
            }
          }
        }

        if (c1 === 0 && c2 === 0) {
          resolve({
            primary: fallbackPrimary,
            secondary: fallbackSecondary,
            glow: `${fallbackPrimary}55`,
          });
          return;
        }

        const p1 = boostVibrancy(
          c1 > 0 ? r1 / c1 : r2 / c2,
          c1 > 0 ? g1 / c1 : g2 / c2,
          c1 > 0 ? b1 / c1 : b2 / c2
        );
        const p2 = boostVibrancy(
          c2 > 0 ? r2 / c2 : r1 / c1,
          c2 > 0 ? g2 / c2 : g1 / c1,
          c2 > 0 ? b2 / c2 : b1 / c1
        );

        const primary = rgbToHex(p1[0], p1[1], p1[2]);
        const secondary = rgbToHex(p2[0], p2[1], p2[2]);
        resolve({
          primary,
          secondary,
          glow: `rgba(${Math.round(p1[0])}, ${Math.round(p1[1])}, ${Math.round(p1[2])}, 0.36)`,
        });
      } catch {
        resolve({
          primary: fallbackPrimary,
          secondary: fallbackSecondary,
          glow: `${fallbackPrimary}55`,
        });
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve({
        primary: fallbackPrimary,
        secondary: fallbackSecondary,
        glow: `${fallbackPrimary}55`,
      });
    };

    img.src = coverUrl;
  });
}
