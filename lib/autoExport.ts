/**
 * autoExport — «التصدير التلقائي» في صفحة التشييك.
 *
 * مقفول (الافتراضي) = زي ما البرنامج شغّال بالظبط: المندوب بيدوس «تصدير
 * اللوحات للسجلات». مفتوح = اللوحات بتروح لشيت السجلات لوحدها.
 *
 * **القاعدة الحاكمة (بأمر المالك): مفيش تصدير تلقائي بلا موقع.**
 * الـGPS بيوصل بعد اللوحة بثواني. اللوحة اللي اتحفظت من غير مكانها مالهاش
 * لازمة عند المندوب — مش هيعرف يروح لها. فاللي لسه مستنّي موقعه بيفضل في
 * صفحة التشييك لحد ما الموقع يوصل، مهما طال. ولو الـGPS مقفول خالص بيفضل
 * مكانه والمندوب يصدّره بإيده من الزرار (اللي بيسأله الأول).
 */

/**
 * إيقاع التصدير التلقائي **لليدوي والكاميرا**: كل ٥ دقايق (طلب المالك).
 * الصوت مختلف — بيتصدّر أول ما التسجيل يقفل، مش على مؤقّت.
 */
export const AUTO_EXPORT_INTERVAL_MS = 5 * 60_000;

/** مفتاح التخزين على الجهاز — الإعداد لكل جهاز، مش لكل حساب. */
export const AUTO_EXPORT_KEY = "ic:autoExport";

/** الإعداد المحفوظ. الافتراضي **مقفول** — مفيش سلوك بيتغيّر لحد من غير ما يطلبه. */
export function loadAutoExport(): boolean {
  try { return localStorage.getItem(AUTO_EXPORT_KEY) === "1"; } catch { return false; }
}

export function saveAutoExport(on: boolean): void {
  try { localStorage.setItem(AUTO_EXPORT_KEY, on ? "1" : "0"); } catch { /* التخزين مقفول */ }
}

/**
 * الصف ده معاه موقع؟ التلات طرق (يدوي/كاميرا/صوت) بتخزّن الموقع بنفس الشكل:
 * رابط خريطة جاهز، أو إحداثيات. **مصدر واحد للقاعدة** عشان طريقة منهم
 * ماتفضلش بقاعدة مختلفة في صمت.
 */
export function hasRowLocation(r: { mapsLink?: string | null; lat?: number | null }): boolean {
  return !!r.mapsLink || r.lat != null;
}

/** الجاهز للتصدير التلقائي = **اللي معاه موقع بس**. */
export function readyForAutoExport<T>(rows: T[], hasLocation: (r: T) => boolean = hasRowLocation as (r: T) => boolean): T[] {
  return rows.filter(hasLocation);
}

/**
 * عدد الصفوف اللي لسه مستنية موقعها.
 * بيتعرض للمندوب جنب المفتاح — من غيره التلقائي بيبان «واقف» وهو بيستنى.
 */
export function waitingForLocation<T>(rows: T[], hasLocation: (r: T) => boolean = hasRowLocation as (r: T) => boolean): number {
  return rows.length - readyForAutoExport(rows, hasLocation).length;
}

/**
 * رسالة بعد تصدير الصوت — المالك طلب إن المندوب يشوف كام لوحة راحت.
 * ولو فيه لوحات لسه مستنية موقعها بيتقال له، عشان مايفتكرش إنها ضاعت.
 */
export function exportedMessage(exported: number, waiting: number): string {
  const head = exported === 1 ? "تم تصدير لوحة واحدة للسجلات." : `تم تصدير ${exported} لوحة للسجلات.`;
  if (waiting <= 0) return head;
  const tail = waiting === 1
    ? "وفيه لوحة لسه مستنية موقعها — هتتصدّر أول ما الموقع يوصل."
    : `وفيه ${waiting} لوحة لسه مستنية موقعها — هيتصدّروا أول ما الموقع يوصل.`;
  return `${head}
${tail}`;
}

/** رسالة لما التسجيل يقفل ومفيش ولا لوحة جاهزة. */
export function nothingExportedMessage(waiting: number): string | null {
  if (waiting <= 0) return null;
  return waiting === 1
    ? "لوحة واحدة لسه مستنية موقعها — هتتصدّر أول ما الموقع يوصل."
    : `${waiting} لوحة لسه مستنية موقعها — هيتصدّروا أول ما الموقع يوصل.`;
}
