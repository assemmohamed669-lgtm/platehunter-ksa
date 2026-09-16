/**
 * تفضيل «تسجيل الموقع» في صفحة التشييك.
 *
 * المندوب بيقدر يقفل تسجيل الموقع، فالسيارة تتشيّك وتتسجّل **من غير موقع**
 * (يدوي / صوتي / كاميرا). لما يرجّعه، الموقع يتسجّل عادي زي الأول.
 *
 * بيتخزّن على الجهاز عشان يفضل بعد ما يقفل التطبيق — لو رجع مفتوح لوحده،
 * المندوب هيلاقي مواقع اتسجّلت وهو فاكرها مقفولة.
 */

export const GPS_OFF_KEY = "ph:check:gpsOff";

/** بيترجم القيمة المتخزّنة. أي حاجة غير «1» = الموقع شغّال (الافتراضي الآمن). */
export function gpsOffFromStored(raw: string | null): boolean {
  return raw === "1";
}

export function loadGpsOff(): boolean {
  try {
    return gpsOffFromStored(localStorage.getItem(GPS_OFF_KEY));
  } catch {
    return false;   // التخزين مرفوض (نافذة خاصة) — مانكسرش التشييك
  }
}

export function saveGpsOff(off: boolean): void {
  try {
    localStorage.setItem(GPS_OFF_KEY, off ? "1" : "0");
  } catch { /* التخزين مرفوض — الإعداد يشتغل للجلسة دي بس */ }
}
