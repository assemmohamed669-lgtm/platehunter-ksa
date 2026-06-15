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
        night: "#07140F",        // app background (deep forest black)
        "night-oled": "#000000", // OLED battery-saver background
        surface: "#0F2A20",     // cards, nav bar
        "surface-2": "#16352A", // elevated surfaces / inputs
        border: "#1E4536",

        // Brand greens
        primary: "#1FAE6E",     // buttons, active states
        "primary-dark": "#0B3D2E",
        glow: "#39FF9E",        // signature neon green: plate readout, bank matches

        // Text
        ink: "#EAF6EF",
        muted: "#7FA897",

        // Status
        alert: "#F2722B",       // duplicate plate highlight (orange)
        danger: "#EF4444",      // duplicate plate highlight (red) / errors
      },
      fontFamily: {
        sans: ["var(--font-tajawal)", "Tahoma", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 12px rgba(57, 255, 158, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
