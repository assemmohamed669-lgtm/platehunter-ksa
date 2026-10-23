/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎙️ التسجيل والتشييك يفضلوا شغّالين والمندوب برّه البرنامج — أندرويد 1.8 (٢٤ أكتوبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «عايز المندوب لما يحب يشوف الواتس اب او يتصفح التليفون والتسجيل شغال او التشييك يفضل شغال … او عايز يفتح
 * موقع جي بي اس علي الخريطه». أندرويد بيقطع الميك عن البرنامج اللي في الخلفية — إلا لو شغّال «خدمة في المقدمة» بإشعار
 * ظاهر («🎙️ قناص بيسجّل»). الخدمة في تطبيق أندرويد 1.8 (`BackgroundRecordingService.java`)، والجسر `window.PlateHunterBg`.
 *  · من غير الجسر (التطبيق القديم · الآيفون · المتصفح) ⇒ ولا حاجة بتتغيّر.
 *  · 📞 مكالمة بدأت (أندرويد بيبعت `phNativeCall`) ⇒ الصفحة تقفل الميك — «المكالمة ليها الأولوية» (المالك ٢٣ سبتمبر).
 *  · السوبر أدمن الأول (`BG_RECORDING_FOR_ALL`) — للكل بعد تجربة المالك.
 */
type Bridge = { start?: (text: string) => boolean; stop?: () => void; active?: () => boolean };

export const BG_RECORDING_FOR_ALL = false;

/** نص الإشعار الثابت وقت التسجيل */
export const BG_RECORDING_TEXT = "التسجيل شغّال — قول اللوحات عادي حتى وانت في واتساب أو الخريطة";

function bridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { PlateHunterBg?: Bridge }).PlateHunterBg) ?? null;
}

/** ينفع التسجيل يكمّل في الخلفية على الجهاز ده ولِلحساب ده؟ */
export function canRecordInBackground(isSuper: boolean): boolean {
  return !!bridge()?.start && (isSuper === true || BG_RECORDING_FOR_ALL);
}

/** لما التسجيل يبدأ — `true` = الإشعار طلع والخدمة شغّالة */
export function startBackgroundRecording(text: string = BG_RECORDING_TEXT): boolean {
  try {
    return bridge()?.start?.(text) === true;
  } catch {
    return false;
  }
}

/** لما التسجيل يقف (أو الصفحة تتقفل) — الإشعار بيختفي */
export function stopBackgroundRecording(): void {
  try {
    bridge()?.stop?.();
  } catch {
    /* الجسر مش موجود/وقع — ولا حاجة */
  }
}

/** 📞 أندرويد: مكالمة بدأت والتسجيل شغّال */
export function onNativeCall(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => fn();
  window.addEventListener("phNativeCall", h);
  return () => window.removeEventListener("phNativeCall", h);
}
