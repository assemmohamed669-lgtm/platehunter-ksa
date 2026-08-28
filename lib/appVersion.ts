/**
 * نسخة البرنامج + ملاحظة آخر تحديث. بيتبنّوا في الجافاسكريبت المنشور، و /api/version
 * بترجّعهم طازة (بدون كاش). لو النسخة اللي على الجهاز (المخزّنة) مختلفة عن اللي على
 * السيرفر → معناه فيه تحديث والمندوب شغّال نسخة قديمة، فبيظهرله بانر التحديث.
 *
 * لما تنزّل تحديث مهم: زوّد APP_VERSION واكتب ملاحظة قصيرة في UPDATE_NOTE.
 */
export const APP_VERSION = "1.1.0";

/**
 * معرّف البناء — بيتغيّر مع **كل نشر** (SHA الكوميت). بيتقارن بين الجهاز والسيرفر
 * عشان التطبيق يحدّث نفسه تلقائياً لما ينزل نشر جديد، من غير ما المندوب يدوس تحديث.
 * (APP_VERSION فوق بتفضل يدوية للعرض/الهارت-بيت — دي للكشف التلقائي بس.)
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const UPDATE_NOTE =
  "إصلاح توقّف صفحة الفرز على الآيفون عند رفع ملفات الداتا الكبيرة، وتحسين سرعة القراءة والتخزين على كل الأجهزة.";

/** يمسح الكاش + يلغي الـ service worker + يعيد التحميل بآخر نسخة (cache-busting). */
export async function refreshAppNow(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* caches unavailable */ }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    if (regs) await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* no SW */ }
  const u = new URL(window.location.href);
  u.searchParams.set("_r", String(Date.now()));
  window.location.replace(u.toString());
}
