/**
 * themePresets — قوالب مظهر احترافية بتغيّر شكل التطبيق:
 * **كروت صلبة واضحة القراءة** + خلفية راقية وراها (تدرّج/ميش + علامة مائية خفيفة
 * لأشكال) + لون مميّز قوي + ظلال ناعمة. **مفيش شفافية تغطّي النص** (ده كان بيبهّت
 * الكلام) — كل كلمة في كل الصفحات تفضل باينة. تنوّع حقيقي: ٢٠ قالب فاتح وغامق.
 *
 * التطبيق في applyAppearance: القالب بيحط --app-bg (الخلفية) + ألوان الأسطح الصلبة
 * + اللون المميّز + --app-shadow (ظل الكروت). الألوان الدلالية (مطلوب أخضر /
 * مقطوع أحمر) مابتتغيّرش. الحبر (ink) دايماً غامق على الفاتح وفاتح على الغامق
 * فالتباين مضمون، والنص الثانوي (muted) نسخة أخفت بتباين كافٍ.
 */
export interface ThemeTemplate {
  id: string;
  name: string;
  dark: boolean;
  /** خلفية الصفحة (تدرّج/ميش + علامة مائية خفيفة) — ورا الكروت، مش بتغطّيها. */
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

// ── علامات مائية خفيفة جداً (opacity ~0.05) ورا المحتوى لإحساس «مصمَّم» — مش
//    بتأثّر على قراءة أي نص. لون العلامة بيتحدّد حسب فاتح/غامق. ──
const dotsLight = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='38' height='38'%3E%3Ccircle cx='3' cy='3' r='1.6' fill='%23000' fill-opacity='0.045'/%3E%3C/svg%3E\")";
const dotsDark = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='38' height='38'%3E%3Ccircle cx='3' cy='3' r='1.6' fill='%23fff' fill-opacity='0.05'/%3E%3C/svg%3E\")";
const gridLight = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Cpath d='M44 0H0v44' fill='none' stroke='%23000' stroke-opacity='0.04' stroke-width='1'/%3E%3C/svg%3E\")";
const gridDark = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Cpath d='M44 0H0v44' fill='none' stroke='%23fff' stroke-opacity='0.045' stroke-width='1'/%3E%3C/svg%3E\")";
const diagLight = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30'%3E%3Cpath d='M0 30L30 0' stroke='%23000' stroke-opacity='0.035' stroke-width='1.4'/%3E%3C/svg%3E\")";
const ringsDark = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Ccircle cx='40' cy='40' r='26' fill='none' stroke='%23fff' stroke-opacity='0.04' stroke-width='1.5'/%3E%3C/svg%3E\")";

export const THEME_TEMPLATES: ThemeTemplate[] = [
  // ═══════════ فاتحة (كروت بيضا صلبة + خلفية خفيفة ملوّنة) ═══════════
  {
    id: "royal-purple", name: "بنفسجي راقي", dark: false,
    bg: `${dotsLight}, linear-gradient(165deg, #f4ebff 0%, #fbf7ff 55%, #fdf2fb 100%)`,
    surface: "#ffffff", surface2: "#f7f1ff", border: "#eaddff",
    ink: "#1f1533", muted: "#6c5b8c", primary: "#8b3dff", primaryDark: "#f0e6ff",
    shadow: "0 8px 24px rgba(124,58,237,0.12), 0 2px 6px rgba(124,58,237,0.06)",
  },
  {
    id: "fresh-green", name: "أخضر نضِر", dark: false,
    bg: "linear-gradient(165deg, #e6f7ee 0%, #f4fbf7 60%, #eefaf3 100%)",
    surface: "#ffffff", surface2: "#eefaf2", border: "#cdeede",
    ink: "#0f261b", muted: "#4f7563", primary: "#15803d", primaryDark: "#e2f7ea",
    shadow: "0 8px 24px rgba(22,163,74,0.12), 0 2px 6px rgba(22,163,74,0.06)",
  },
  {
    id: "rose-elegant", name: "وردي أنيق", dark: false,
    bg: `${dotsLight}, linear-gradient(165deg, #ffe9f1 0%, #fff4f8 60%, #fff0f5 100%)`,
    surface: "#ffffff", surface2: "#fff0f5", border: "#ffd6e4",
    ink: "#2c101c", muted: "#8c5c6c", primary: "#e11d69", primaryDark: "#ffe4ef",
    shadow: "0 8px 24px rgba(225,29,105,0.12), 0 2px 6px rgba(225,29,105,0.06)",
  },
  {
    id: "sky-clean", name: "سماوي نضيف", dark: false,
    bg: "linear-gradient(165deg, #e7f2ff 0%, #f4faff 60%, #eef6ff 100%)",
    surface: "#ffffff", surface2: "#eef6ff", border: "#cfe4fb",
    ink: "#0f1e2e", muted: "#557089", primary: "#0b6fd6", primaryDark: "#e2f0ff",
    shadow: "0 8px 24px rgba(10,132,255,0.12), 0 2px 6px rgba(10,132,255,0.06)",
  },
  {
    id: "teal-calm", name: "فيروزي هادئ", dark: false,
    bg: `${gridLight}, linear-gradient(165deg, #e2f7f5 0%, #f2fbfa 60%, #eafaf8 100%)`,
    surface: "#ffffff", surface2: "#e9f8f6", border: "#c4ebe6",
    ink: "#0d2624", muted: "#4a716d", primary: "#0f766e", primaryDark: "#dcf5f2",
    shadow: "0 8px 24px rgba(13,148,136,0.12), 0 2px 6px rgba(13,148,136,0.06)",
  },
  {
    id: "amber-warm", name: "كهرماني دافئ", dark: false,
    bg: "linear-gradient(165deg, #fdf1dd 0%, #fef8ec 60%, #fdf3e2 100%)",
    surface: "#ffffff", surface2: "#fdf4e4", border: "#f3e0bd",
    ink: "#2c2008", muted: "#836b45", primary: "#b45309", primaryDark: "#fbeccf",
    shadow: "0 8px 24px rgba(217,119,6,0.13), 0 2px 6px rgba(217,119,6,0.06)",
  },
  {
    id: "indigo-soft", name: "نيلي ناعم", dark: false,
    bg: `${dotsLight}, linear-gradient(165deg, #e9eaff 0%, #f4f5ff 60%, #eef0ff 100%)`,
    surface: "#ffffff", surface2: "#eef0ff", border: "#d5d9fb",
    ink: "#161633", muted: "#5c608c", primary: "#4f46e5", primaryDark: "#e6e8ff",
    shadow: "0 8px 24px rgba(79,70,229,0.12), 0 2px 6px rgba(79,70,229,0.06)",
  },
  {
    id: "crimson-clean", name: "قرمزي أنيق", dark: false,
    bg: "linear-gradient(165deg, #ffe9e9 0%, #fff4f3 60%, #fff0ef 100%)",
    surface: "#ffffff", surface2: "#fff0ef", border: "#ffd6d3",
    ink: "#2c0f0f", muted: "#8c5a58", primary: "#dc2626", primaryDark: "#ffe1de",
    shadow: "0 8px 24px rgba(220,38,38,0.12), 0 2px 6px rgba(220,38,38,0.06)",
  },
  {
    id: "slate-pro", name: "رمادي احترافي", dark: false,
    bg: `${gridLight}, linear-gradient(165deg, #eef1f5 0%, #f6f8fa 60%, #eef1f5 100%)`,
    surface: "#ffffff", surface2: "#f1f4f8", border: "#dbe1e9",
    ink: "#141b26", muted: "#5b6673", primary: "#334155", primaryDark: "#e6eaf0",
    shadow: "0 8px 24px rgba(51,65,85,0.10), 0 2px 6px rgba(51,65,85,0.06)",
  },
  {
    id: "coral-peach", name: "مرجاني", dark: false,
    bg: "linear-gradient(165deg, #ffece5 0%, #fff5f1 60%, #fff1ec 100%)",
    surface: "#ffffff", surface2: "#fff1eb", border: "#ffdccf",
    ink: "#2c130c", muted: "#8c6156", primary: "#cf4526", primaryDark: "#ffe5db",
    shadow: "0 8px 24px rgba(242,100,60,0.13), 0 2px 6px rgba(242,100,60,0.06)",
  },
  {
    id: "sage-forest", name: "زيتي فاتح", dark: false,
    bg: `${diagLight}, linear-gradient(165deg, #eef3e6 0%, #f6f9f0 60%, #f0f5e8 100%)`,
    surface: "#ffffff", surface2: "#f1f5e9", border: "#dae4c9",
    ink: "#1e2610", muted: "#647153", primary: "#4f7a30", primaryDark: "#e9f2da",
    shadow: "0 8px 24px rgba(95,140,62,0.12), 0 2px 6px rgba(95,140,62,0.06)",
  },
  {
    id: "lavender-mist", name: "لافندر", dark: false,
    bg: `${dotsLight}, linear-gradient(165deg, #efeafc 0%, #f7f4fd 60%, #f3eefb 100%)`,
    surface: "#ffffff", surface2: "#f4effc", border: "#e2d9f5",
    ink: "#211a30", muted: "#6b6088", primary: "#7c5cd6", primaryDark: "#ece5fa",
    shadow: "0 8px 24px rgba(124,92,214,0.12), 0 2px 6px rgba(124,92,214,0.06)",
  },
  // ═══════════ غامقة (كروت غامقة صلبة + خلفية غامقة بلمعة/علامة مائية) ═══════════
  {
    id: "midnight-royal", name: "ليلي فاخر", dark: true,
    bg: "radial-gradient(1100px 720px at 18% -5%, #17224e 0%, transparent 55%), radial-gradient(900px 600px at 100% 100%, #142046 0%, transparent 50%), #0a0f22",
    surface: "#131a30", surface2: "#1b2440", border: "#2b3559",
    ink: "#ffffff", muted: "#c6d3ec", primary: "#4f9dff", primaryDark: "#1a2748",
    shadow: "0 10px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(120,150,255,0.06)",
  },
  {
    id: "dark-gold", name: "ذهبي داكن", dark: true,
    bg: `${ringsDark}, radial-gradient(1000px 700px at 82% -5%, #2a2114 0%, transparent 52%), radial-gradient(800px 560px at 0% 100%, #241d10 0%, transparent 48%), #14110b`,
    surface: "#1c1810", surface2: "#282216", border: "#3b3120",
    ink: "#ffffff", muted: "#ddd0b4", primary: "#d4a544", primaryDark: "#2a2214",
    shadow: "0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,165,68,0.10)",
  },
  {
    id: "emerald-dark", name: "زمردي داكن", dark: true,
    bg: `${gridDark}, radial-gradient(1000px 700px at 15% -5%, #0d3326 0%, transparent 52%), radial-gradient(800px 560px at 100% 100%, #0a2b20 0%, transparent 48%), #08130e`,
    surface: "#10231b", surface2: "#173027", border: "#25443a",
    ink: "#ffffff", muted: "#c3e2d5", primary: "#2fbf82", primaryDark: "#12261d",
    shadow: "0 10px 28px rgba(0,0,0,0.48), 0 0 0 1px rgba(47,191,130,0.08)",
  },
  {
    id: "wine-dark", name: "عنابي داكن", dark: true,
    bg: "radial-gradient(1000px 700px at 82% -5%, #3a1420 0%, transparent 52%), radial-gradient(800px 560px at 0% 100%, #2c0f18 0%, transparent 48%), #170a0e",
    surface: "#241016", surface2: "#31171e", border: "#4a2530",
    ink: "#ffffff", muted: "#eac6d0", primary: "#e84a6f", primaryDark: "#2e141b",
    shadow: "0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(232,74,111,0.09)",
  },
  {
    id: "deep-teal", name: "بترولي داكن", dark: true,
    bg: `${ringsDark}, radial-gradient(1000px 700px at 20% -5%, #0a2f34 0%, transparent 52%), radial-gradient(800px 560px at 100% 100%, #082a2f 0%, transparent 48%), #06171a`,
    surface: "#0e2327", surface2: "#153036", border: "#22454c",
    ink: "#ffffff", muted: "#c0e2e4", primary: "#22c3c9", primaryDark: "#0f272b",
    shadow: "0 10px 28px rgba(0,0,0,0.48), 0 0 0 1px rgba(34,195,201,0.08)",
  },
  {
    id: "charcoal-neon", name: "فحمي ونيون", dark: true,
    bg: `${dotsDark}, radial-gradient(900px 600px at 85% -5%, #1b2130 0%, transparent 50%), #0c0e14`,
    surface: "#15181f", surface2: "#1e222c", border: "#2e3440",
    ink: "#ffffff", muted: "#cbd2dd", primary: "#5ce1a6", primaryDark: "#16211c",
    shadow: "0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(92,225,166,0.10)",
  },
  {
    id: "plum-dark", name: "برقوقي داكن", dark: true,
    bg: `${ringsDark}, radial-gradient(1000px 700px at 18% -5%, #2c1440 0%, transparent 52%), radial-gradient(800px 560px at 100% 100%, #23103a 0%, transparent 48%), #130a1d`,
    surface: "#1e1230", surface2: "#28193f", border: "#3b285a",
    ink: "#ffffff", muted: "#dbcdef", primary: "#a875ff", primaryDark: "#221533",
    shadow: "0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,117,255,0.09)",
  },
  {
    id: "navy-steel", name: "كحلي فولاذي", dark: true,
    bg: `${gridDark}, radial-gradient(1000px 700px at 80% -5%, #14243b 0%, transparent 52%), #0a121c`,
    surface: "#111d2e", surface2: "#18293d", border: "#264056",
    ink: "#ffffff", muted: "#c6d5e8", primary: "#38a3d1", primaryDark: "#122236",
    shadow: "0 10px 28px rgba(0,0,0,0.48), 0 0 0 1px rgba(56,163,209,0.08)",
  },
];

export function getTemplate(id: string | null | undefined): ThemeTemplate | null {
  if (!id) return null;
  return THEME_TEMPLATES.find((t) => t.id === id) ?? null;
}
