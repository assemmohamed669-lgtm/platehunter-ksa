/**
 * themePresets — قوالب مظهر جاهزة **حديثة** بتغيّر شكل التطبيق بالكامل:
 * خلفية ميش (mesh gradient) ورا كل المحتوى + أسطح زجاجية شفافة (glass/blur) +
 * لون مميّز. كله CSS نقي (مفيش صور خارجية) عشان يشتغل أوفلاين وخفيف.
 *
 * التطبيق بيتم في applyAppearance: القالب بيحط --app-bg (الخلفية) + يخلّي الأسطح
 * (--c-surface...) شفافة، ويفعّل الـblur عبر data-glass على <html>.
 *
 * ملاحظة: الألوان الدلالية (مطلوب أخضر / مقطوع أحمر) مابتتغيّرش — بس اللون
 * المميّز (--c-primary) بيتبع القالب.
 */
export interface ThemeTemplate {
  id: string;
  name: string;
  /** قيمة `background` كاملة للخلفية (ميش + لون أساس). */
  bg: string;
  /** rgba شفافة للأسطح (كروت/شريط) — عشان الخلفية تبان من وراها = زجاج. */
  surface: string;
  surface2: string;
  border: string;
  ink: string;
  muted: string;
  primary: string;
  /** خلفية خفيفة للون المميّز (شرائح/أزرار مختارة). */
  primaryDark: string;
}

/**
 * كل قالب = base color + طبقتين/تلاتة radial-gradient (ميش) — ده الستايل اللي
 * بتستخدمه التطبيقات الاحترافية (Stripe/Linear...). كلها غامقة عشان الزجاج
 * والنص الفاتح يبانوا أحسن.
 */
export const THEME_TEMPLATES: ThemeTemplate[] = [
  {
    id: "midnight-glass",
    name: "زجاجي غامق",
    bg: "radial-gradient(1200px 820px at 12% 6%, rgba(56,189,248,0.28), transparent 60%), radial-gradient(1100px 780px at 90% 92%, rgba(37,99,235,0.26), transparent 58%), radial-gradient(900px 700px at 80% 8%, rgba(129,140,248,0.16), transparent 55%), #070b16",
    surface: "rgba(17,24,42,0.72)",
    surface2: "rgba(28,37,60,0.66)",
    border: "rgba(148,180,255,0.18)",
    ink: "#eaf1ff",
    muted: "#9db0d6",
    primary: "#38bdf8",
    primaryDark: "rgba(56,189,248,0.16)",
  },
  {
    id: "aurora",
    name: "شفق قطبي",
    bg: "radial-gradient(1100px 800px at 10% 8%, rgba(167,139,250,0.30), transparent 58%), radial-gradient(1000px 760px at 88% 20%, rgba(45,212,191,0.24), transparent 55%), radial-gradient(1200px 820px at 60% 100%, rgba(244,114,182,0.24), transparent 60%), #0c0a1e",
    surface: "rgba(26,20,44,0.70)",
    surface2: "rgba(40,30,64,0.64)",
    border: "rgba(196,168,255,0.20)",
    ink: "#f3ecff",
    muted: "#c0b2df",
    primary: "#a78bfa",
    primaryDark: "rgba(167,139,250,0.18)",
  },
  {
    id: "cyber-neon",
    name: "نيون سايبر",
    bg: "radial-gradient(1000px 720px at 8% 10%, rgba(34,224,161,0.24), transparent 56%), radial-gradient(1100px 760px at 92% 88%, rgba(255,46,151,0.24), transparent 56%), radial-gradient(900px 640px at 90% 6%, rgba(0,209,255,0.16), transparent 52%), #05070f",
    surface: "rgba(11,16,26,0.72)",
    surface2: "rgba(18,26,40,0.66)",
    border: "rgba(34,224,161,0.22)",
    ink: "#daffee",
    muted: "#89b4b0",
    primary: "#22e0a1",
    primaryDark: "rgba(34,224,161,0.15)",
  },
  {
    id: "luxe-gold",
    name: "معدني فاخر",
    bg: "radial-gradient(1100px 800px at 14% 8%, rgba(224,176,99,0.22), transparent 56%), radial-gradient(1000px 760px at 88% 94%, rgba(120,90,45,0.30), transparent 58%), radial-gradient(900px 680px at 80% 10%, rgba(255,214,140,0.10), transparent 52%), #11100b",
    surface: "rgba(28,24,17,0.74)",
    surface2: "rgba(42,35,24,0.66)",
    border: "rgba(224,176,99,0.22)",
    ink: "#f6edd9",
    muted: "#c3b291",
    primary: "#e0b063",
    primaryDark: "rgba(224,176,99,0.16)",
  },
];

export function getTemplate(id: string | null | undefined): ThemeTemplate | null {
  if (!id) return null;
  return THEME_TEMPLATES.find((t) => t.id === id) ?? null;
}
