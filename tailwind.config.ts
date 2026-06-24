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
        // Base surfaces
        night: "#0D1117",        // app background (dark neutral)
        "night-oled": "#000000", // OLED battery-saver background
        surface: "#161B22",      // cards, nav bar
        "surface-2": "#21262D",  // elevated surfaces / inputs
        border: "#30363D",

        // Brand greens
        primary: "#2EA043",      // soft green buttons, active states
        "primary-dark": "#0F3A1F",
        glow: "#3FB950",         // softer green: plate readout, bank matches

        // Text
        ink: "#E6EDF3",
        muted: "#8B949E",

        // Status
        alert: "#D29922",        // amber warning
        danger: "#F85149",       // soft red / errors
      },
      fontFamily: {
        sans: ["var(--font-tajawal)", "Tahoma", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 10px rgba(63, 185, 80, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
