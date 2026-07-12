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
