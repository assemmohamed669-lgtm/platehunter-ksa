/**
 * تنبيه «سيارة مطلوبة» موحّد لكل البرنامج.
 *
 * أي مكان بيلاقي لوحة مطلوبة (كاميرا / صوت / يدوي / تسجيل) بينادي
 * fireWantedAlert(...) — فيظهر نفس الـ overlay بنفس الرسالة بالظبط،
 * مع صفّارة إنذار الحرب، وزر «تم» يوقفها ويقفل الرسالة.
 *
 * الـ overlay نفسه (WantedAlertOverlay) متركّب مرة واحدة في اللياوت،
 * وبيسمع للحدث ده.
 */
export interface WantedAlertDetail {
  plate: string;
  matchType?: "exact" | "fuzzy";
  similarity?: number;
  /** تفاصيل السيارة كأزواج [المفتاح، القيمة] — تظهر تحت اللوحة. */
  info?: [string, string][];
  /** مصدر التشييك — لأغراض العرض فقط. */
  source?: "camera" | "voice" | "manual";
}

export const WANTED_ALERT_EVENT = "wantedPlateAlert";

export function fireWantedAlert(detail: WantedAlertDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WantedAlertDetail>(WANTED_ALERT_EVENT, { detail }));
}

/**
 * 🔕 آخر «تم» في طابور التنبيهات — المالك (١٨ أكتوبر ٢٠٢٦): «وقت مايحصل سيارة عادي المايك يقف … المهم الرنه تظهر معاه».
 * Voice PRO بيوقّف التسجيل مع العربية المطلوبة (المايك المفتوح بيوطّي الصفّارة)، وبيرجّعه لوحده لما الحدث ده ييجي. بيتبعت
 * **جوّه ضغطة «تم» نفسها** — الموبايل بيسمح يفتح المايك تاني من غير لمسة جديدة.
 */
export const WANTED_ALERTS_CLEARED_EVENT = "wantedAlertsCleared";

export function fireWantedAlertsCleared(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WANTED_ALERTS_CLEARED_EVENT));
}

/** بيرجّع إلغاء الاشتراك. */
export function onWantedAlertsCleared(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => { try { cb(); } catch { /* مشترك بايظ مايوقّعش «تم» */ } };
  window.addEventListener(WANTED_ALERTS_CLEARED_EVENT, h);
  return () => window.removeEventListener(WANTED_ALERTS_CLEARED_EVENT, h);
}
