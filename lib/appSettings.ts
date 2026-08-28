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

import { getTemplate } from "./themePresets";

export interface Appearance {
  fontScale: number;        // 1.0 – 1.6
  bgColor: string | null;   // null = theme default (light / وضع التوفير)
  /**
   * لون الخط اليدوي. null = تلقائي من الخلفية (أبيض على الغامق، غامق على الفاتح).
   * لو المستخدم اختار خلفية والخط اختفى (تلقائي مش مناسب لعينه)، يقدر يحدده يدوي هنا
   * فيتغلّب على التلقائي.
   */
  inkColor: string | null;
  /** قالب مظهر جاهز (خلفية ميش + زجاج) — null/غير موجود = بدون قالب (ألوان عادية). */
  template?: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = { fontScale: 1, bgColor: null, inkColor: null, template: null };

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

/** يفكّ لون hex (3 أو 6 خانات) لـ RGB، أو null لو مش صالح. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** True when a hex colour is dark enough to need light text on top of it. */
export function isDarkColor(hex: string): boolean {
  const c = parseHex(hex);
  if (!c) return false;
  // Perceived luminance (0–255); < 140 reads as "dark".
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 140;
}

/** يمزج لونين hex بنسبة t (0 = a، 1 = b). دالة نقية للاختبار. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return a;
  const k = Math.max(0, Math.min(1, t));
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k);
  const hx = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hx(ch(pa.r, pb.r))}${hx(ch(pa.g, pb.g))}${hx(ch(pa.b, pb.b))}`;
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const p = JSON.parse(raw) as Partial<Appearance>;
    return {
      fontScale: clampFontScale(Number(p.fontScale) || 1),
      bgColor: p.bgColor ?? null,
      inkColor: typeof p.inkColor === "string" ? p.inkColor : null,
      template: typeof p.template === "string" ? p.template : null,
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

  // ── قالب جاهز (خلفية ميش + أسطح زجاجية + لون مميّز) — بيتغلّب على اللون اليدوي ──
  const tpl = getTemplate(a.template);
  if (tpl) {
    // كروت صلبة (مقروءة) + خلفية خفيفة وراها + ظل ناعم. مفيش شفافية على النص.
    root.style.setProperty("--app-bg", tpl.bg);          // body بيستخدمها كخلفية الصفحة
    root.style.setProperty("--app-shadow", tpl.shadow);  // ظل الكروت (globals.css)
    root.setAttribute("data-template", "1");
    root.style.setProperty("--c-night", "transparent");  // الصفحة شفافة عشان --app-bg يبان
    root.style.setProperty("--c-night-oled", "transparent");
    root.style.setProperty("--c-surface", tpl.surface);
    root.style.setProperty("--c-surface-2", tpl.surface2);
    root.style.setProperty("--c-border", tpl.border);
    root.style.setProperty("--c-primary", tpl.primary);
    root.style.setProperty("--c-primary-dark", tpl.primaryDark);
    const ink = a.inkColor ?? tpl.ink;                   // لون خط يدوي يتغلّب لو المستخدم حدده
    root.style.setProperty("--c-ink", ink);
    root.style.setProperty("--c-muted", a.inkColor ? mixHex(a.inkColor, tpl.dark ? "#000000" : "#ffffff", 0.35) : tpl.muted);
    return;
  }
  // مفيش قالب — امسح آثاره ورجّع الافتراضي.
  root.style.removeProperty("--app-bg");
  root.style.removeProperty("--app-shadow");
  root.removeAttribute("data-template");
  root.style.removeProperty("--c-primary");
  root.style.removeProperty("--c-primary-dark");

  // ── الخلفية: نفس اللون على **كل الأسطح** (الصفحة + الكروت + الشريط الجانبي) ──
  // مع تدرّج بسيط للكروت (surface-2) والحدود (border) عشان مايبقاش كله مسطّح.
  const bgVars = ["--c-night", "--c-night-oled", "--c-surface", "--c-surface-2", "--c-border"];
  if (a.bgColor) {
    const toward = isDarkColor(a.bgColor) ? "#FFFFFF" : "#000000"; // ناحية التباين
    root.style.setProperty("--c-night", a.bgColor);
    root.style.setProperty("--c-night-oled", a.bgColor);
    root.style.setProperty("--c-surface", a.bgColor);
    root.style.setProperty("--c-surface-2", mixHex(a.bgColor, toward, 0.08));
    root.style.setProperty("--c-border", mixHex(a.bgColor, toward, 0.22));
  } else {
    for (const v of bgVars) root.style.removeProperty(v); // رجوع لألوان الثيم
  }

  // ── لون الخط: يدوي (يتغلّب على التلقائي) → تلقائي من الخلفية → افتراضي الثيم. ──
  // والنص الثانوي (muted) بيتبع لون الخط كنسخة أخفت عشان يفضل واضح على نفس الخلفية.
  const ink = a.inkColor ?? (a.bgColor ? (isDarkColor(a.bgColor) ? LIGHT_INK : DARK_INK) : null);
  if (ink) {
    const bgRef = a.bgColor ?? (isDarkColor(ink) ? "#000000" : "#FFFFFF");
    root.style.setProperty("--c-ink", ink);
    root.style.setProperty("--c-muted", mixHex(ink, bgRef, 0.4));
  } else {
    root.style.removeProperty("--c-ink");
    root.style.removeProperty("--c-muted");
  }
}

/** Load the saved settings and apply them (call once on app mount). */
export function initAppearance(): Appearance {
  const a = loadAppearance();
  applyAppearance(a);
  return a;
}
