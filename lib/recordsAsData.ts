/**
 * ربط سجلات المندوب (شيت السجلات) كـ**خانة داتا** في صفحة الفرز — عشان يفرز
 * عليها أي إحالة بدون ما ينزّل الملف ويرفعه تاني.
 *
 * ربط **حي**: الفرز بيبني السجلات من المحفوظ في التطبيق كل مرة، فأي سيارة
 * يضيفها/يعدّلها المندوب بتظهر في الفرز فوراً من غير ما يدوس تاني.
 *
 * الوجهة (`target`):
 *  • "extra" = مربع داتا **إضافي** — بيتضاف جنب داتا المندوب المثبّتة من غير ما
 *    يلغيها (الافتراضي والأأمن).
 *  • "main"  = مربع الداتا **الأساسي** — بيشغل مكان المربع الأساسي **لو فاضي**؛
 *    لو عنده داتا مثبّتة فيه، الفرز بيحطّ السجلات كمربع إضافي تلقائياً عشان
 *    ماتتلغيش داتاه (الحماية في صفحة الفرز).
 */

const LINK_KEY = "ph:sorting:recordsAsData";     // "1" = مربوط
const TARGET_KEY = "ph:sorting:recordsTarget";   // "main" | "extra"

/** حدث بيتبعت للصفحات لما الربط يتغيّر (نفس تبويب المتصفّح). */
export const RECORDS_LINK_EVENT = "ph:recordsLinkChanged";

export type RecordsTarget = "main" | "extra";

export function isRecordsLinked(): boolean {
  try { return localStorage.getItem(LINK_KEY) === "1"; } catch { return false; }
}

export function recordsTarget(): RecordsTarget {
  try { return localStorage.getItem(TARGET_KEY) === "main" ? "main" : "extra"; } catch { return "extra"; }
}

export function linkRecords(target: RecordsTarget): void {
  try {
    localStorage.setItem(LINK_KEY, "1");
    localStorage.setItem(TARGET_KEY, target);
    window.dispatchEvent(new CustomEvent(RECORDS_LINK_EVENT));
  } catch { /* storage unavailable */ }
}

export function unlinkRecords(): void {
  try {
    localStorage.removeItem(LINK_KEY);
    window.dispatchEvent(new CustomEvent(RECORDS_LINK_EVENT));
  } catch { /* storage unavailable */ }
}
