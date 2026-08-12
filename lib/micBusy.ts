/**
 * micBusy — علم بسيط: هل الميكروفون مفتوح دلوقتي (تشييك صوتي / تسجيل)؟
 *
 * ليه موجود: صفّارة الرسالة العاجلة بتطلع من سمّاعة الجهاز، والميك مفتوح في
 * التشييك الصوتي — فالصفّارة بترجع تدخل في التسجيل وتفتح بوابة الكلام (VAD)،
 * فتتبعت ضوضاء لـDeepgram وممكن تتفرّغ كحرف يلخبط اللوحة.
 *
 * فبنأجّل الصفّارة لحد ما المندوب يقفل التسجيل. البانر بيفضل ظاهر بالأحمر طول
 * الوقت — التأجيل على الصوت بس.
 *
 * موديول عالمي (مش React state) عشان البانر في شِلّ التطبيق يقرا الحالة من
 * صفحة التشييك من غير ما يبقى بينهم ربط.
 */

let busy = false;
const listeners = new Set<(v: boolean) => void>();

export function isMicBusy(): boolean {
  return busy;
}

/** صفحة التشييك بتنده دي أول ما التسجيل يبدأ/يقف. */
export function setMicBusy(value: boolean): void {
  if (busy === value) return;
  busy = value;
  for (const fn of listeners) {
    try { fn(value); } catch { /* مستمع بايظ مايوقفش الباقي */ }
  }
}

/** يشترك في تغيّر الحالة؛ بيرجّع دالة إلغاء الاشتراك. */
export function onMicBusyChange(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** للاختبارات — يرجّع الحالة للأصل. */
export function resetMicBusy(): void {
  busy = false;
  listeners.clear();
}
