/**
 * appSettings — user-adjustable appearance (font size + custom text/background
 * colours), persisted on-device and applied app-wide via CSS variables.
 *
 * Deliberately touches ONLY the general text colour (--c-ink) and the page
 * background (--c-night). Status/semantic colours (brand/danger/alert) are left
 * alone so "مطلوبة/غير مطلوبة" keep their green/red meaning. Font scaling sets
 * the root font-size, and Tailwind's rem-based text sizes follow it.
 */

export interface Appearance {
  fontScale: number;        // 1.0 – 1.6
  textColor: string | null; // null = theme default
  bgColor: string | null;   // null = theme default
}

export const DEFAULT_APPEARANCE: Appearance = { fontScale: 1, textColor: null, bgColor: null };

const KEY = "ph:appearance";

/** Keep the font scale within a safe, readable range. */
export function clampFontScale(n: number): number {
  if (!Number.isFinite(n)) return n === Infinity ? 1.6 : 1;
  return Math.min(1.6, Math.max(1, Math.round(n * 100) / 100));
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const p = JSON.parse(raw) as Partial<Appearance>;
    return {
      fontScale: clampFontScale(Number(p.fontScale) || 1),
      textColor: p.textColor ?? null,
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

  if (a.textColor) root.style.setProperty("--c-ink", a.textColor);
  else root.style.removeProperty("--c-ink");

  if (a.bgColor) {
    root.style.setProperty("--c-night", a.bgColor);
    root.style.setProperty("--c-night-oled", a.bgColor);
  } else {
    root.style.removeProperty("--c-night");
    root.style.removeProperty("--c-night-oled");
  }
}

/** Load the saved settings and apply them (call once on app mount). */
export function initAppearance(): Appearance {
  const a = loadAppearance();
  applyAppearance(a);
  return a;
}
