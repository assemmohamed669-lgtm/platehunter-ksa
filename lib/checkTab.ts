/**
 * checkTab — مخزن عالمي بسيط لتبويب صفحة التشييك النشط (نفس فكرة micBusy).
 *
 * ليه موجود: المشترك «صوت فقط» بقى بيتنقّل بين خيارات التشييك (صوتي/يدوي/شاص/
 * شهايد/السجلات/فرز) من **الشريط التحتي** (BottomNav في شِلّ التطبيق) زي قناص،
 * بدل التبويبات اللي كانت فوق. الشريط بيبدّل التبويب من هنا، وصفحة التشييك بتقرا
 * وتكتب فيه — من غير ما نغيّر الـURL (يتجنّب useSearchParams اللي بيطلب Suspense).
 *
 * موديول عالمي (مش React state) عشان الشريط التحتي وصفحة التشييك يتكلّموا من غير
 * ربط مباشر بينهم.
 */
export type CheckTab = "manual" | "camera" | "ptt" | "sheet" | "chassis" | "sort" | "cert";

let cur: CheckTab = "ptt";
const listeners = new Set<(t: CheckTab) => void>();

export function getCheckTab(): CheckTab {
  return cur;
}

/** الشريط التحتي (أو صفحة التشييك) بتنده دي عشان تبدّل التبويب النشط. */
export function setCheckTab(t: CheckTab): void {
  if (cur === t) return;
  cur = t;
  for (const fn of listeners) {
    try { fn(t); } catch { /* مستمع بايظ مايوقفش الباقي */ }
  }
}

/** يشترك في تغيّر التبويب؛ بيرجّع دالة إلغاء الاشتراك. */
export function onCheckTabChange(fn: (t: CheckTab) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
