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

        // UI accent (calm blue-grey — general interactive elements)
        primary: "#4A82BF",      // calm blue: buttons, active states, focus rings
        "primary-dark": "#1C3A5E",
        glow: "#6E9FD4",         // lighter blue: highlights, active nav

        // Match / Recording green (strict use: voice recording, manual entry, match alert)
        brand: "#2EA043",
        "brand-dark": "#0F3A1F",
        "brand-glow": "#3FB950",

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
        glow: "0 0 10px rgba(74, 130, 191, 0.35)",
        "brand-glow": "0 0 10px rgba(63, 185, 80, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
