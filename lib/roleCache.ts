/**
 * ══════════════════════════════════════════════════════════════════════
 *  ذاكرة دور المستخدم — عشان زرار «الأدمن» يظهر فوراً
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (٢٩ سبتمبر ٢٠٢٦): «فيه لاج في ظهور كلمة أدمن اللي بدخل من
 * خلالها على صفحة المشتركين».
 *
 * الشريط العلوي كان مستني **نداءين للسيرفر ورا بعض** قبل ما يعرف يعرض الزرار
 * ولا لأ، وكل ده بيتعاد من أول وجديد كل مرة يفتح البرنامج. هنا بنفتكر الدور
 * على الجهاز فالزرار يظهر من أول لحظة، والسيرفر يأكّد بعدها بلحظة.
 *
 * 🔒 الذاكرة **مربوطة بصاحبها** (`userId`): جهاز عليه مندوبين، أو أدمن خرج
 * ومندوب دخل مكانه — الزرار مايظهرش للتاني. والزرار **اختصار بس**؛ الدخول
 * الفعلي محميّ بحارس `app/admin/layout.tsx` وبقواعد الداتابيز (RLS)، ودول
 * مالهمش دعوة بالذاكرة دي خالص.
 */

const KEY = "ph:roleCache";

/** أقصى عمر للدور المتخزّن — مانعتمدش على دور عمره أسابيع. */
export const ROLE_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function encodeRoleCache(userId: string, role: string, now: number): string {
  return JSON.stringify({ userId, role, at: now });
}

/**
 * بترجّع الدور المتخزّن **لو** هو بتاع نفس المستخدم ولسه في المدة. أي شك
 * (مفيش، بايظة، مستخدم تاني، قديمة) ⇒ `null` والزرار يفضل مخفي لحد ما
 * السيرفر يرد.
 */
export function decodeRoleCache(
  raw: string | null,
  userId: string,
  now: number,
  maxAgeMs: number = ROLE_CACHE_MAX_AGE_MS,
): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { userId?: unknown; role?: unknown; at?: unknown };
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (typeof v.userId !== "string" || typeof v.role !== "string") return null;
    if (typeof v.at !== "number") return null;
    if (v.userId !== userId) return null;              // 🔒 صاحبها غيره
    if (now - v.at > maxAgeMs) return null;            // قديمة (الساعة لورا = ماشي)
    return v.role;
  } catch {
    return null;
  }
}

/** قراءة من تخزين الجهاز — بترجّع null لو التخزين مقفول أو فاضي. */
export function readCachedRole(userId: string, now: number = Date.now()): string | null {
  try {
    return decodeRoleCache(localStorage.getItem(KEY), userId, now);
  } catch {
    return null;
  }
}

/** حفظ الدور بعد ما السيرفر يرد. أي فشل في التخزين بيتجاهل بهدوء. */
export function saveCachedRole(userId: string, role: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, encodeRoleCache(userId, role, now));
  } catch { /* تخزين مقفول — الزرار هيظهر متأخّر بس، مافيش ضرر */ }
}
