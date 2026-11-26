export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["'DM Sans'", "'Segoe UI Variable Text'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Cascadia Mono'", "monospace"],
      },
      colors: {
        void: "#050507",
        obsidian: "#09090B",
        panel: "#0E0F13",
        elevated: "#15161D",
        cyanpulse: "rgb(var(--awase-accent-rgb) / <alpha-value>)",
        indigoglow: "rgb(var(--awase-accent2-rgb) / <alpha-value>)",
        mintsignal: "#22C55E",
        amberpulse: "#FFCC00",
        ember: "#FF6B2C",
        crimson: "#F43F5E",
      },
    },
  },
  plugins: [],
};
