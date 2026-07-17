/**
 * قاموس أشكال نطق الحروف — مشتقّ من البذرة
 * ==========================================
 * مصدر الحقيقة الوحيد: `saudiPlateLetters.ts`. الملف ده **بيشتق** منه
 * (import/transform) — مش بيعيد كتابة القيم ولا بيخترع أشكال جديدة.
 *
 * • `CANONICAL_PLATE_LETTERS` — الـ 17 حرف الرسميين بترتيب البذرة.
 * • `LETTER_VARIANT_MAP` — كل شكل نطق (variant) → الحرف الـ canonical بتاعه.
 *   مبني من `variants` **فقط**. الـ `riskyOverlaps` **ما بتدخلش** الخريطة
 *   المباشرة أبداً — دي شغل آلة الحالة (سياق اللوحة) في المرحلة ٢.
 *
 * مبدأ «ممنوع الإسقاط الصامت» متطبّق على مستوى البيانات نفسها: لو variant
 * واحد اتنسب لحرفين، الاشتقاق بيرمي استثناء بصوت عالي بدل ما يختار واحد بصمت.
 */
import {
  SAUDI_PLATE_LETTERS,
  type PlateLetterEntry,
} from "./saudiPlateLetters";

/** الـ 17 حرف الرسميين — canonical فقط، بترتيب البذرة */
export const CANONICAL_PLATE_LETTERS: string[] = SAUDI_PLATE_LETTERS.map(
  (e) => e.canonical
);

/**
 * بيبني خريطة variant → canonical من قائمة حروف.
 * بيرمي لو نفس الـ variant اتنسب لأكتر من canonical (تعارض بيانات).
 */
export function buildLetterVariantMap(
  entries: PlateLetterEntry[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    for (const variant of entry.variants) {
      const existing = map[variant];
      if (existing !== undefined && existing !== entry.canonical) {
        throw new Error(
          `تعارض في شكل النطق "${variant}": متنسب لـ "${existing}" و "${entry.canonical}" — لازم يتحل في البذرة قبل الاشتقاق.`
        );
      }
      map[variant] = entry.canonical;
    }
  }
  return map;
}

/** شكل النطق → الحرف الـ canonical (مبني من variants فقط) */
export const LETTER_VARIANT_MAP: Record<string, string> =
  buildLetterVariantMap(SAUDI_PLATE_LETTERS);
