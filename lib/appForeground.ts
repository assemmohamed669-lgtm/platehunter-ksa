/**
 * ══════════════════════════════════════════════════════════════════════
 *  📱 التطبيق قدام المندوب ولا في الخلفية — من التطبيق نفسه مش من رأي الصفحة (٢٩ أكتوبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * أندرويد 1.8 والتسجيل شغّال في الخلفية: `MainActivity.keepWebViewRunning` بيقول للصفحة إنها **ظاهرة** وهي مش ظاهرة
 * (عشان نوافذ الصوت ماتقفش). فـ`document.visibilityState` بقى بيكدب ⇒ «سجل المشاكل» والصندوق الأسود كانوا بيحسبوا وقفات
 * الخلفية «تهنيج» (~٦٠ث — ايهاب محمد) وقفل الأندرويد للتطبيق «وقعة» (killed-visible). الحَكَم هنا حالة التطبيق من
 * `@capacitor/app` (`appStateChange`) — في المتصفح من غير تطبيق بتمشي مع الصفحة زي الأول.
 * تسجيل بس — مابيغيّرش أي سلوك.
 */

let active = true;
let lastSwitch = 0;
const listeners = new Set<(active: boolean) => void>();
let watching = false;

/** حالة التطبيق اتغيّرت (من مستمع `@capacitor/app` — أو الاختبارات). */
export function setAppActive(a: boolean, now: number = Date.now()): void {
  if (a === active) return;
  active = a;
  lastSwitch = now;
  for (const cb of [...listeners]) {
    try { cb(a); } catch { /* مستمع بيرمي مايوقّفش الباقيين */ }
  }
}

export function appInBackground(): boolean {
  return !active;
}

/** في الخلفية دلوقتي، أو راح/رجع بعد `t` ⇒ الفجوة من `t` لحد دلوقتي مش تهنيج. */
export function appAwaySince(t: number): boolean {
  return !active || lastSwitch >= t;
}

/** زي `document.visibilityState` — بس «مستخبية» لما التطبيق نفسه في الخلفية. */
export function pageVisibility(): DocumentVisibilityState {
  if (!active) return "hidden";
  try { return document.visibilityState; } catch { return "visible"; }
}

function watch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  void import("@capacitor/app")
    .then(({ App }) => App.addListener("appStateChange", (s) => setAppActive(!!s.isActive)))
    .catch(() => { /* من غير تطبيق — الصفحة بس */ });
}

/** اسمع تغيير حالة التطبيق (بيبدأ المراقبة أول مرة). بيرجّع دالة إيقاف. */
export function onAppState(cb: (active: boolean) => void): () => void {
  listeners.add(cb);
  watch();
  return () => { listeners.delete(cb); };
}
