/**
 * themePresets — قوالب مظهر احترافية بتغيّر شكل التطبيق:
 * **كروت صلبة واضحة القراءة** + خلفية خفيفة راقية وراها + لون مميّز قوي + ظلال
 * ناعمة. مفيش شفافية تغطّي النص (ده كان بيبهّت الكلام). تنوّع فاتح وغامق.
 *
 * التطبيق في applyAppearance: القالب بيحط --app-bg (الخلفية الخفيفة) + ألوان
 * الأسطح الصلبة + اللون المميّز + --app-shadow (ظل الكروت). الألوان الدلالية
 * (مطلوب أخضر / مقطوع أحمر) مابتتغيّرش.
 */
export interface ThemeTemplate {
  id: string;
  name: string;
  dark: boolean;
  /** خلفية الصفحة الخفيفة (تدرّج هادي) — ورا الكروت، مش بتغطّيها. */
  bg: string;
  /** لون الكارت **الصلب** (مقروء تماماً). */
  surface: string;
  surface2: string;
  border: string;
  ink: string;
  muted: string;
  primary: string;
  /** خلفية خفيفة للون المميّز (شرائح/أزرار مختارة). */
  primaryDark: string;
  /** ظل الكروت — بيدّي إحساس «مرفوع» احترافي. */
  shadow: string;
}

export const THEME_TEMPLATES: ThemeTemplate[] = [
  // ── فاتحة (كروت بيضا صلبة + خلفية خفيفة ملوّنة) ──
  {
    id: "royal-purple",
    name: "بنفسجي راقي",
    dark: false,
    bg: "linear-gradient(165deg, #f4ebff 0%, #fbf7ff 55%, #fdf2fb 100%)",
    surface: "#ffffff",
    surface2: "#f7f1ff",
    border: "#eaddff",
    ink: "#1f1533",
    muted: "#6c5b8c",
    primary: "#8b3dff",
    primaryDark: "#f0e6ff",
    shadow: "0 8px 24px rgba(124,58,237,0.12), 0 2px 6px rgba(124,58,237,0.06)",
  },
  {
    id: "fresh-green",
    name: "أخضر نضِر",
    dark: false,
    bg: "linear-gradient(165deg, #e6f7ee 0%, #f4fbf7 60%, #eefaf3 100%)",
    surface: "#ffffff",
    surface2: "#eefaf2",
    border: "#cdeede",
    ink: "#0f261b",
    muted: "#4f7563",
    primary: "#16a34a",
    primaryDark: "#e2f7ea",
    shadow: "0 8px 24px rgba(22,163,74,0.12), 0 2px 6px rgba(22,163,74,0.06)",
  },
  {
    id: "rose-elegant",
    name: "وردي أنيق",
    dark: false,
    bg: "linear-gradient(165deg, #ffe9f1 0%, #fff4f8 60%, #fff0f5 100%)",
    surface: "#ffffff",
    surface2: "#fff0f5",
    border: "#ffd6e4",
    ink: "#2c101c",
    muted: "#8c5c6c",
    primary: "#e11d69",
    primaryDark: "#ffe4ef",
    shadow: "0 8px 24px rgba(225,29,105,0.12), 0 2px 6px rgba(225,29,105,0.06)",
  },
  {
    id: "sky-clean",
    name: "سماوي نضيف",
    dark: false,
    bg: "linear-gradient(165deg, #e7f2ff 0%, #f4faff 60%, #eef6ff 100%)",
    surface: "#ffffff",
    surface2: "#eef6ff",
    border: "#cfe4fb",
    ink: "#0f1e2e",
    muted: "#557089",
    primary: "#0a84ff",
    primaryDark: "#e2f0ff",
    shadow: "0 8px 24px rgba(10,132,255,0.12), 0 2px 6px rgba(10,132,255,0.06)",
  },
  // ── غامقة (كروت غامقة صلبة + خلفية غامقة بلمعة خفيفة) ──
  {
    id: "midnight-royal",
    name: "ليلي فاخر",
    dark: true,
    bg: "radial-gradient(1100px 720px at 18% -5%, #17224e 0%, transparent 55%), radial-gradient(900px 600px at 100% 100%, #142046 0%, transparent 50%), #0a0f22",
    surface: "#131a30",
    surface2: "#1b2440",
    border: "#2b3559",
    ink: "#eaf1ff",
    muted: "#9db0d6",
    primary: "#4f9dff",
    primaryDark: "#1a2748",
    shadow: "0 10px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(120,150,255,0.06)",
  },
  {
    id: "dark-gold",
    name: "ذهبي داكن",
    dark: true,
    bg: "radial-gradient(1000px 700px at 82% -5%, #2a2114 0%, transparent 52%), radial-gradient(800px 560px at 0% 100%, #241d10 0%, transparent 48%), #14110b",
    surface: "#1c1810",
    surface2: "#282216",
    border: "#3b3120",
    ink: "#f6edd9",
    muted: "#b8a684",
    primary: "#d4a544",
    primaryDark: "#2a2214",
    shadow: "0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,165,68,0.10)",
  },
];

export function getTemplate(id: string | null | undefined): ThemeTemplate | null {
  if (!id) return null;
  return THEME_TEMPLATES.find((t) => t.id === id) ?? null;
}
