/**
 * autoExport — «التصدير التلقائي» في صفحة التشييك.
 *
 * مقفول (الافتراضي) = زي ما البرنامج شغّال بالظبط: المندوب بيدوس «تصدير
 * اللوحات للسجلات». مفتوح = اللوحات بتروح لشيت السجلات لوحدها.
 *
 * **ليه مش بنصدّر اللوحة أول ما تتسجّل:** الموقع بيوصل بعد اللوحة بثواني.
 * لو صدّرناها على طول بتتحفظ في السجلات **بلا موقع للأبد** — والمندوب
 * مايعرفش إلا وهو بيدوّر على العربية. فالتلقائي بيستنى الموقع، وبمهلة قصوى
 * عشان اللوحة ماتعلّقش لو الـGPS مقفول من الأساس.
 */

/** كل قد إيه المحرّك بيبص لو فيه صف جاهز. */
export const AUTO_EXPORT_TICK_MS = 2_000;

/** أقصى انتظار للموقع قبل ما نصدّر الصف من غيره. */
export const AUTO_EXPORT_WAIT_MS = 20_000;

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
 * بيسجّل أول مرة شفنا فيها كل صف، وبينضّف اللي راح (اتصدّر أو اتمسح) عشان
 * الخريطة ماتكبرش مع اليوم.
 */
export function trackFirstSeen(ids: string[], firstSeen: Map<string, number>, now: number): void {
  const live = new Set(ids);
  for (const id of firstSeen.keys()) if (!live.has(id)) firstSeen.delete(id);
  for (const id of ids) if (!firstSeen.has(id)) firstSeen.set(id, now);
}

/** الصفوف الجاهزة للتصدير التلقائي: معاها موقع، أو استنّت أكتر من المهلة. */
export function readyForAutoExport<T>(
  rows: T[],
  idOf: (r: T) => string,
  hasLocation: (r: T) => boolean,
  firstSeen: Map<string, number>,
  now: number,
  waitMs: number = AUTO_EXPORT_WAIT_MS,
): T[] {
  return rows.filter((r) => {
    if (hasLocation(r)) return true;
    const since = firstSeen.get(idOf(r));
    if (since === undefined) return false;      // لسه ما اتسجّلش — استنى دورة
    return now - since > waitMs;
  });
}

/**
 * الصف ده معاه موقع؟ التلات طرق (يدوي/كاميرا/صوت) بتخزّن الموقع بنفس الشكل:
 * رابط خريطة جاهز، أو إحداثيات. **مصدر واحد للقاعدة** عشان طريقة منهم
 * ماتفضلش بقاعدة مختلفة في صمت.
 */
export function hasRowLocation(r: { mapsLink?: string | null; lat?: number | null }): boolean {
  return !!r.mapsLink || r.lat != null;
}
