import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // All tokens resolve to CSS variables so one class on <html> ("oled" =
        // battery-saving dark mode) swaps the whole palette at once, hover/focus
        // variants included. Light values live in :root and the dark overrides
        // in html.oled — see app/globals.css. Light mode is byte-identical to
        // the old hardcoded hex, so it's unaffected.
        night: "var(--c-night)",
        "night-oled": "var(--c-night-oled)",
        surface: "var(--c-surface)",
        "surface-2": "var(--c-surface-2)",
        border: "var(--c-border)",

        primary: "var(--c-primary)",
        "primary-dark": "var(--c-primary-dark)",
        glow: "var(--c-glow)",

        brand: "var(--c-brand)",
        "brand-dark": "var(--c-brand-dark)",
        "brand-glow": "var(--c-brand-glow)",

        ink: "var(--c-ink)",
        muted: "var(--c-muted)",

        alert: "var(--c-alert)",
        danger: "var(--c-danger)",
      },
      fontFamily: {
        sans: ["var(--font-tajawal)", "Tahoma", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 10px rgba(26, 108, 196, 0.20)",
        "brand-glow": "0 0 10px rgba(26, 127, 55, 0.20)",
        card: "0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
