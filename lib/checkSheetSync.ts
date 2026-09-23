/**
 * ══════════════════════════════════════════════════════════════════════
 *  مزامنة شيت التشييك بين «التشييك» و«الجديد»
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «ممكن يترفع من صفحة التشييك عادي وممكن من صفحة
 * الجديد، واللي يترفع سواء هنا أو هنا تظهر في التانية — يعني لو المندوب
 * حدّث التشييك يتحدّث تلقائي ويشتغل تلقائي في الصفحتين».
 *
 * الملف نفسه **مشترك من الأول**: سلوت `local:check` في IndexedDB (موثّق في
 * CLAUDE.md). اللي كان ناقص هو **الإشارة** — الصفحة التانية مكانتش تعرف إن
 * فيه حاجة اتغيّرت، فبتفضل شغّالة على النسخة القديمة اللي في ذاكرتها.
 *
 * ── 🔴 والصفحتين مسارين منفصلين ──────────────────────────────────────
 * فواحدة بس بتكون متركّبة في أي لحظة. «تلقائي» هنا معناها: لما المندوب
 * يرجع للصفحة التانية يلاقي الجديد — من غير ما يقفل التطبيق ويفتحه.
 *
 * فالإشارة على مستويين:
 *   ① `BroadcastChannel` — للتبويبات المفتوحة في نفس اللحظة (سطح المكتب)
 *   ② `localStorage` — بيوصل لتبويبات تانية عبر حدث `storage`، **وبيفضل
 *      مكتوب** فالصفحة اللي تتركّب بعدين تقدر تقارن وتعرف إن فيه تغيير
 *
 * ⚠️ **كله جوّه try**: التخزين ممكن يكون مقفول (وضع خاص/iOS)، والقناة
 *    ممكن ماتكونش موجودة. فشل الإشارة **مايوقّفش** الرفع نفسه.
 */

/** مفتاح الأثر في التخزين — بيتقرا كمان عشان نعرف آخر تغيير إمتى. */
export const CHECK_SYNC_KEY = "ph:check-sheet-changed";

const CHANNEL_NAME = "ph:check-sheet";

type Listener = () => void;
const listeners = new Set<Listener>();

let channel: BroadcastChannel | null = null;
let wired = false;

function fire(): void {
  // نسخة عشان مشترك يلغي نفسه جوّه النداء مايكسرش اللفّة
  for (const cb of Array.from(listeners)) {
    try { cb(); } catch { /* مشترك واقع مايمنعش الباقيين */ }
  }
}

function wire(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = () => fire();
    }
  } catch { channel = null; }
  try {
    window.addEventListener("storage", (e) => {
      if (e.key === CHECK_SYNC_KEY) fire();
    });
  } catch { /* ignore */ }
}

/** «الشيت اتغيّر» — تتنده بعد أي رفع/تغيير/مسح لملف تشييك. */
export function notifyCheckSheetChanged(): void {
  wire();
  const stamp = String(Date.now()) + ":" + Math.random().toString(36).slice(2, 8);
  try { localStorage.setItem(CHECK_SYNC_KEY, stamp); } catch { /* التخزين مقفول */ }
  try { channel?.postMessage(stamp); } catch { /* ignore */ }
  /**
   * 🔴 وبنندي المشتركين **في نفس الصفحة** كمان.
   *
   * `BroadcastChannel` و`storage` **مابيوصلوش لنفس الصفحة اللي بعتت** —
   * دي قاعدة المتصفّح. ولو اكتفينا بيهم، الصفحة اللي رفعت الملف بنفسها
   * مكانتش هتعيد قراءته، فالمندوب يرفع في «الجديد» ومايشوفش نتيجة.
   */
  fire();
}

/** يشترك في إشارة التغيير. بيرجّع دالة إلغاء الاشتراك. */
export function onCheckSheetChanged(cb: Listener): () => void {
  wire();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
