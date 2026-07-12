/**
 * appSettings — user-adjustable appearance (font size + custom background
 * colour), persisted on-device and applied app-wide via CSS variables.
 *
 * The general text colour (--c-ink) is chosen AUTOMATICALLY from the background
 * so the text is always readable — light text on a dark background, dark text on
 * a light one. No manual text-colour picker, so a dark-on-dark clash can't
 * happen. Status/semantic colours (brand/danger/alert) are never touched, so
 * "مطلوبة/غير مطلوبة" keep their green/red meaning. Font scaling sets the root
 * font-size and Tailwind's rem-based text sizes follow it.
 */

export interface Appearance {
  fontScale: number;        // 1.0 – 1.6
  bgColor: string | null;   // null = theme default (light / وضع التوفير)
}

export const DEFAULT_APPEARANCE: Appearance = { fontScale: 1, bgColor: null };

const KEY = "ph:appearance";
const LIGHT_INK = "#F3F5F7"; // text on a dark background
const DARK_INK = "#1A1F24";  // text on a light background
// Capped at 1.3 (130%): big enough to help, small enough that dense screens
// don't overflow/clip content.
export const MAX_FONT_SCALE = 1.3;

/** Keep the font scale within a safe, readable range. */
export function clampFontScale(n: number): number {
  if (!Number.isFinite(n)) return n === Infinity ? MAX_FONT_SCALE : 1;
  return Math.min(MAX_FONT_SCALE, Math.max(1, Math.round(n * 100) / 100));
}

/** True when a hex colour is dark enough to need light text on top of it. */
export function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Perceived luminance (0–255); < 140 reads as "dark".
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const p = JSON.parse(raw) as Partial<Appearance>;
    return {
      fontScale: clampFontScale(Number(p.fontScale) || 1),
      bgColor: p.bgColor ?? null,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable */
  }
}

/** Push the settings onto the document via inline CSS variables on <html>. */
export function applyAppearance(a: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.fontSize = `${Math.round(clampFontScale(a.fontScale) * 100)}%`;

  if (a.bgColor) {
    root.style.setProperty("--c-night", a.bgColor);
    root.style.setProperty("--c-night-oled", a.bgColor);
    // Auto-pick a readable text colour for that background.
    root.style.setProperty("--c-ink", isDarkColor(a.bgColor) ? LIGHT_INK : DARK_INK);
  } else {
    // Back to the theme's own colours (light mode / وضع التوفير black).
    root.style.removeProperty("--c-night");
    root.style.removeProperty("--c-night-oled");
    root.style.removeProperty("--c-ink");
  }
}

/** Load the saved settings and apply them (call once on app mount). */
export function initAppearance(): Appearance {
  const a = loadAppearance();
  applyAppearance(a);
  return a;
}
