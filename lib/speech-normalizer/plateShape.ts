/**
 * شكل اللوحة — الحروف الصالحة (مشتقّة) + مساعدات
 * ==============================================
 * الحروف الصالحة مشتقّة من `CANONICAL_PLATE_LETTERS` (البذرة) مع توحيد ألف
 * مقصورة → ياء (canonical البذرة لـ ياء هو «ى»، والتطبيق بيستخدم «ي» — نفس
 * ما بيعمله `structuredPlates.VALID_PLATE_LETTERS`).
 */
import { CANONICAL_PLATE_LETTERS } from "../dictionaries/letters";

export const VALID_PLATE_LETTERS: Set<string> = new Set(
  CANONICAL_PLATE_LETTERS.map((c) => (c === "ى" ? "ي" : c))
);

export function isDigitChar(c: string): boolean {
  return c >= "0" && c <= "9";
}

/** بيستخرج الحروف الصالحة من توكن، بحد أقصى ٣ (زي salvage في البارسر). */
export function extractPlateLetters(token: string): string[] {
  return [...token].filter((c) => VALID_PLATE_LETTERS.has(c)).slice(0, 3);
}
