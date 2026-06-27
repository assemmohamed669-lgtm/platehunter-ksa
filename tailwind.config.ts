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
        // Base surfaces — light mode (off-white, easy on eyes)
        night: "#F3F5F7",        // app background — cool off-white
        "night-oled": "#FFFFFF", // brightest white variant
        surface: "#FFFFFF",      // cards, nav bar — pure white
        "surface-2": "#EBEEf2",  // inputs, elevated surfaces — light cool gray
        border: "#CDD2D8",       // subtle separator lines

        // UI accent — deep blue, high contrast on white
        primary: "#1A6CC4",      // rich blue: buttons, active states, focus rings
        "primary-dark": "#DBE9F8", // light blue tint: subtle chip backgrounds
        glow: "#0969DA",         // vivid blue: highlights, active nav

        // Match / Recording green — deepened for white backgrounds
        brand: "#1A7F37",
        "brand-dark": "#DAFBE1",
        "brand-glow": "#2DA44E",

        // Text — dark charcoal for maximum readability on white
        ink: "#1A1F24",          // near-black charcoal (softer than pure black)
        muted: "#57606A",        // medium warm gray — always readable on white

        // Status
        alert: "#9A6700",        // amber (adjusted for light bg)
        danger: "#CF222E",       // clear red (adjusted for light bg)
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
