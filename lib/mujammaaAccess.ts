/**
 * 🧮 مين يشوف المجمّع («التسجيل») — ١٨ أكتوبر ٢٠٢٦.
 *
 * المالك: «هيكون متاح مبدأيا ل اللي مشترك في كل خدمات البرنامج يظهر معاه تلقائي لكن اللي مشترك
 * صوت بس واللي مشترك فرز بس ميظهرش معاهم».
 *
 * كل الخدمات = **الصوت** (`voiceTabVisible`: `voicex_enabled` + `voicex_until` سارية) **و**
 * **باقي البرنامج** (`rest_pages_enabled` مش مقفول + `rest_until` سارية) — نفس الشرطين اللي
 * الشريط والتشييك بيقفلوا بيهم. السوبر أدمن دايماً.
 *
 * `MUJAMMAA_FOR_DELEGATES`: مفتاح رجوع سريع — false ⇒ السوبر أدمن بس زي ما كان.
 */
import { serviceActive } from "@/lib/subscription";
import { voiceTabVisible } from "@/lib/voiceAccess";

// ✅ مفتوح للمناديب المشتركين في كل الخدمات — **تجربة** (المالك ١٩ أكتوبر: «انا هفتح للكل علشان نشوف كل حاجه وناخد
// تقرير كامل»). كل تسجيل بتقريره على السيرفر (`mujammaa_report.py`). الرجوع السريع ⇒ `false` (السوبر أدمن بس).
export const MUJAMMAA_FOR_DELEGATES = true;

/**
 * ⏸️ زرار «وقف مؤقت» / «كمّل التسجيل» في المجمّع (المالك ٢٢ أكتوبر ٢٠٢٦: «يوقف التسجيل دة مؤقت الي حين ما يطلع من مكان
 * مفيهوش لوحات … ويكمل ويقول لوحات علي نفس الملف»). 🟢 لكل اللي بيشوفوا «التسجيل» — المالك (٢٤ أكتوبر): «الوقف المؤقت
 * عايزة لكل المناديب» (كان السوبر أدمن الأول، #486).
 */
export const MJ_PAUSE_FOR_DELEGATES = true;

/**
 * 🛣️ مربع «اسم الشارع» في المجمّع (المالك ٣١ أكتوبر ٢٠٢٦: «تضيف مربع المشترك يحط فيه اسم الشارع ودة يبقي عامود
 * لوحدو … يظهر قدام اللوحات بعد التفريغ»). 🟢 لكل اللي بيشوفوا «التسجيل» — المالك (٣١ أكتوبر): «يلا افتحه للكل»
 * (كان السوبر أدمن الأول، #519). الرجوع = false.
 */
export const MJ_STREET_FOR_DELEGATES = true;

export interface AccessProfile {
  is_super?: boolean | null;
  voicex_enabled?: boolean | null;
  voicex_until?: string | null;
  rest_pages_enabled?: boolean | null;
  rest_until?: string | null;
  /**
   * 🔘 زرار الأدمن قدام المندوب (١٩ أكتوبر ٢٠٢٦ — `docs/sql/mujammaa-per-agent.sql`). المالك: «عايز زر قدام كل
   * اسم لما ادوس عليه افتح صفحه التسجيل عند المشترك». true ⇒ يظهر مهما كان اشتراكه · false ⇒ مخفي ·
   * فاضي (أو العمود لسه مااتضافش) ⇒ القاعدة (كل الخدمات).
   */
  mujammaa_enabled?: boolean | null;
}

/** العمود اللي الزرار بيكتبه — بيتقري بـ`selectWithOptional` عشان لو الـSQL لسه ماتشغّلش البرنامج مايقعش */
export const MJ_FLAG_COL = "mujammaa_enabled";

/**
 * استعلام بعمود ممكن يكون لسه مااتضافش: بيجرّب بيه، ولو رجع غلط (العمود مش موجود) بيعيد من غيره.
 * من غيرها نشر الكود قبل الـSQL كان هيوقّع قراية الصلاحيات (الشريط اللي تحت · «التسجيل» · التشييك).
 */
export async function selectWithOptional<T>(
  run: (cols: string) => PromiseLike<{ data: T | null; error: unknown }>,
  base: string,
  optional: string
): Promise<{ data: T | null; error: unknown }> {
  const first = await run(`${base}, ${optional}`);
  if (!first.error) return first;
  return run(base);
}

export function hasAllServices(p: AccessProfile | null | undefined): boolean {
  if (!p) return false;
  if (p.is_super === true) return true;
  const voice = voiceTabVisible(p, null);
  const rest = p.rest_pages_enabled !== false && serviceActive(p.rest_until ?? null);
  return voice && rest;
}

export function canUseMujammaa(p: AccessProfile | null | undefined): boolean {
  if (p?.is_super === true) return true;
  // 🔘 زرار الأدمن بيغلب القاعدة — في الاتجاهين
  if (p?.mujammaa_enabled === true) return true;
  if (p?.mujammaa_enabled === false) return false;
  return MUJAMMAA_FOR_DELEGATES && hasAllServices(p);
}
