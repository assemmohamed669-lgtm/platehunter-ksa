/**
 * manualPlateInput — قواعد مربع التشييك اليدوي.
 *
 * المندوب بيكتب لوحة ورا لوحة بسرعة في الميدان. القواعد:
 *   • اللوحة السعودية = **٣ حروف + ٤ أرقام** (سيارة) أو **حرفين + ٤ أرقام**
 *     (موتوسيكل). أي حرف أو رقم زيادة **مابيتكتبش أصلاً** في المربع.
 *   • ناقصة → مابتتشيّكش، وبتطلع رسالة حمرا تحت.
 *   • الرسالة بتروح لوحدها أول ما يبدأ يكتب اللوحة اللي بعدها.
 */

const AR_DIGITS = /[0-9٠-٩]/;
/** أقصى عدد حروف (السيارة ٣؛ الموتوسيكل ٢ — فالحد الأعلى ٣ للاتنين). */
export const MAX_LETTERS = 3;
export const MAX_DIGITS = 4;

/** حالة اللي مكتوب في المربع دلوقتي. */
export type ManualStatus = "empty" | "incomplete" | "ok";

/**
 * بيقصّ اللي المندوب كتبه على الحد المسموح: أول ٣ حروف وأول ٤ أرقام بترتيبهم
 * زي ما اتكتبوا. بيرجّع `blocked: true` لو فيه حاجة اتمنعت — عشان نوريه رسالة.
 *
 * ملاحظة: المسافات والفواصل بتتشال — المندوب بيكتب «ق ن ص 1234» أو «قنص1234»
 * وبيوصلوا لنفس النتيجة.
 */
export function clampManualPlate(text: string): { text: string; blocked: boolean } {
  let letters = 0;
  let digits = 0;
  let blocked = false;
  let out = "";

  for (const ch of String(text ?? "")) {
    if (/\s/.test(ch)) continue;                   // المسافات مالهاش لازمة
    if (AR_DIGITS.test(ch)) {
      if (digits >= MAX_DIGITS) { blocked = true; continue; }
      digits++; out += ch;
    } else {
      if (letters >= MAX_LETTERS) { blocked = true; continue; }
      letters++; out += ch;
    }
  }
  return { text: out, blocked };
}

/** عدّ الحروف والأرقام في اللي مكتوب. */
export function countPlateParts(text: string): { letters: number; digits: number } {
  let letters = 0, digits = 0;
  for (const ch of String(text ?? "")) {
    if (/\s/.test(ch)) continue;
    if (AR_DIGITS.test(ch)) digits++; else letters++;
  }
  return { letters, digits };
}

/** اللوحة كاملة وجاهزة للتشييك؟ */
export function manualStatus(text: string): ManualStatus {
  const { letters, digits } = countPlateParts(text);
  if (letters === 0 && digits === 0) return "empty";
  if ((letters === 2 || letters === 3) && digits === MAX_DIGITS) return "ok";
  return "incomplete";
}

/** رسالة حمرا للمندوب حسب اللي كتبه — أو null لو مافيش مشكلة. */
export function manualHint(text: string, blocked = false): string | null {
  if (blocked) return "تأكد من اللوحة — زيادة عن ٣ حروف و٤ أرقام";
  const st = manualStatus(text);
  if (st === "empty" || st === "ok") return null;
  return "تأكد من اللوحة — لازم ٣ حروف و٤ أرقام (سيارة) أو حرفين و٤ أرقام (موتوسيكل)";
}
