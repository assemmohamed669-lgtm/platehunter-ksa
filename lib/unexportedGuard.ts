/**
 * حارس اللوحات غير المصدَّرة — علم عالمي زي `micBusy`.
 *
 * 🔴 **الحادثة اللي عشانها اتعمل (١٢ أكتوبر ٢٠٢٦):** مندوب سجّل لوحات في
 * Voice PRO، قفل التسجيل من **غير تصدير**، راح لصفحة الفرز عشان إحالة جات من
 * البنك، ورجع — ملقاش اللوحات.
 *
 * ولما دوّرنا عليها اتأكد إنها **مش موجودة في أي مكان**:
 *   • مش في سجلاته على الجهاز ولا على السيرفر — لأنها مااتصدّرتش أصلاً.
 *   • ولا حتى في الصوت الخام — السيرفر الجديد (أكتوبر) مش بيحفظ المقاطع.
 * يعني شغل ساعة ضاع بالكامل ومفيش طريق استرجاع.
 *
 * الحارس بيخلّي الخروج من الصفحة **يسأل** طول ما فيه لوحات مش متصدّرة. العدّاد
 * عالمي (مش React state) عشان الشريط التحتي — اللي في شِلّ التطبيق — يقراه من
 * غير ربط مباشر بالصفحة، بالظبط زي `micBusy`.
 */

let count = 0;
const listeners = new Set<(n: number) => void>();

export function getUnexportedCount(): number {
  return count;
}

/** الصفحة بتنده دي كل ما عدد اللوحات غير المصدَّرة يتغيّر. */
export function setUnexportedCount(n: number): void {
  const next = Math.max(0, Math.floor(n) || 0);
  if (count === next) return;          // مافيش تغيير = مانرسمش الشريط من جديد
  count = next;
  for (const fn of listeners) {
    try { fn(next); } catch { /* مستمع بايظ مايوقفش الباقي */ }
  }
}

/** يشترك في التغيّر؛ بيرجّع دالة إلغاء الاشتراك. */
export function onUnexportedChange(fn: (n: number) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** للاختبارات — يرجّع الحالة للأصل. */
export function resetUnexportedGuard(): void {
  count = 0;
  listeners.clear();
}

/** رسالة التأكيد قبل الخروج. `null` = مافيش داعي للسؤال. */
export function leaveWarning(n: number): string | null {
  if (n <= 0) return null;
  return `عندك ${n} لوحة لسه ما اتصدّرتش للسجلات.\n\n` +
    `لو خرجت من الصفحة ممكن تضيع.\n\n` +
    `«إلغاء» = ارجع وصدّرها   |   «موافق» = اخرج`;
}
