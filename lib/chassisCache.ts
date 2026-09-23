/**
 * ══════════════════════════════════════════════════════════════════════
 *  «التنقل بين الصفحات بقى تقيل» — خريطة الشاص بتتحسب **مرة لكل ملف**
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «التنقل بين الصفحات عايزها سلسة… بعد ما ضيفنا
 * صفحة الجديد بقت تقيلة شوي».
 *
 * 🔴 كل مرة «الجديد» كانت بتفتح — **أو الموبايل يصحى من القفل** — كانت بتعمل
 * `readAllSheets` على ملف التشييك **كله** (٤٩ ألف لوحة) عشان تدوّر على عمود
 * الشاص في الورقات التانية. تحليل إكسل كامل على الخيط الرئيسي، ثواني على
 * الموبايل — والنتيجة **نفسها بالظبط** طول ما الملف ماتغيّرش.
 *
 * ⚠️ **نسخة واحدة بس في الذاكرة**: الآيفون بيقتل التطبيق لو الذاكرة زادت
 *    (متسجّل من صفحة الفرز). خريطة لوحة ← شاص لـ٤٩ ألف لوحة = بضعة ميجا، ولو
 *    اتحفظ أكتر من ملف كانت هتتراكم.
 */

export interface FingerprintSource {
  fileName?: string | null;
  fileBlob?: { size?: number } | null;
  rows?: readonly unknown[] | null;
}

/**
 * بصمة الملف — **من غير تاريخ** عن قصد.
 *
 * متسجّل من صفحة الفرز: الملف بيتحفظ تاني بـ`uploadedAt` جديد وهو نفس
 * المحتوى، فبصمة فيها التاريخ كانت بتضيّع الحفظ في كل مرة. الاسم + الحجم +
 * عدد الصفوف كفاية يفرّقوا ملفين في الواقع.
 */
export function checkFingerprint(rec: FingerprintSource | null | undefined): string | null {
  if (!rec) return null;
  const name = String(rec.fileName ?? "");
  const size = Number(rec.fileBlob?.size ?? 0);
  const n = Array.isArray(rec.rows) ? rec.rows.length : 0;
  return name + "|" + size + "|" + n;
}

let slot: { fp: string; map: Map<string, string> } | null = null;

/** الخريطة المحفوظة لو البصمة نفسها، وإلا `null` (لازم تتحسب). */
export function getCachedChassis(fp: string | null): Map<string, string> | null {
  if (!fp || !slot || slot.fp !== fp) return null;
  return slot.map;
}

/** يحفظ الخريطة — **بيمسح أي نسخة قبلها** (نسخة واحدة بس). */
export function setCachedChassis(fp: string | null, map: Map<string, string>): void {
  if (!fp) return;
  slot = { fp, map };
}

export function clearChassisCache(): void {
  slot = null;
}
