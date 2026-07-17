/**
 * أخطاء السمع الشائعة (قسم الحروف) — مشتقّة من البذرة
 * ====================================================
 * مصدر الحقيقة الوحيد: `COMMON_LETTER_MISTAKES` في `saudiPlateLetters.ts`.
 * دي مش أشكال نطق (variants) — دي كلمات المحرك بيكتبها **غلط** بدل اسم الحرف
 * (زي: صاد → «سعد»). بتتطبّق بثقة medium/low في **مرحلة الحروف فقط**،
 * والتصحيح المتعلم بيكمّل عليها.
 *
 * الملف بيعيد تصدير القائمة زي ما هي + بيشتق منها خريطة بحث سريعة.
 */
import { COMMON_LETTER_MISTAKES } from "./saudiPlateLetters";

export { COMMON_LETTER_MISTAKES };

/** الكلمة المسموعة غلط → { الحرف الرسمي، درجة الثقة } */
export const LETTER_MISTAKE_MAP: Record<
  string,
  { canonical: string; confidence: "medium" | "low" }
> = Object.fromEntries(
  COMMON_LETTER_MISTAKES.map((m) => [
    m.heard,
    { canonical: m.canonical, confidence: m.confidence },
  ])
);
