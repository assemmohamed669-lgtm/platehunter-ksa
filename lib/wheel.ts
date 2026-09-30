/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎡 عجلة الحظ — منطق مشترك بين التطبيق والسيرفر
 * ══════════════════════════════════════════════════════════════════════
 *
 * طلب المالك (٣٠ سبتمبر ٢٠٢٦): زرار في صفحة كل مندوب عند الأدمن — لما المندوب
 * يدفع ويتمدّدله الاشتراك، الأدمن يدوس فتظهر للمندوب العجلة **مرة واحدة**.
 * الأيام اللي يكسبها بتتضاف لاشتراكه (الصوت و/أو باقي البرنامج — حسب اللي هو
 * مشترك فيه). لو قفلها من غير ما يلف بترجع تظهرله؛ لما يلف بتقفل.
 *
 * **القفل مربوط بالتجديد مش بضغطة الزرار**: كل تمديد بيتسجّل في
 * `subscription_events`، وبنربط اللفّة بآخر تجديد. ضغطتين على نفس التجديد =
 * لفّة واحدة. تمديد جديد الشهر الجاي = لفّة جديدة.
 *
 * ⚠️ الاحتمالات هنا لازم تفضل **مطابقة** للـSQL في
 * `docs/sql/wheel-of-fortune-v2.sql` — السيرفر هو اللي بيقرّر فعلاً، وده نسخة
 * للعرض والاختبار.
 */

/** الاحتمالات المعتمدة من المالك. المتوسط ≈ ١.٦ يوم لكل لفّة. */
export const WHEEL_ODDS = [
  { days: 4, chance: 0.01 },
  { days: 3, chance: 0.05 },
  { days: 2, chance: 0.47 },
  { days: 1, chance: 0.47 },
] as const;

/** بتحوّل رقم عشوائي [0,1) لعدد أيام بالاحتمالات اللي فوق. */
export function pickDays(r: number): number {
  if (r < 0.01) return 4;
  if (r < 0.06) return 3;
  if (r < 0.53) return 2;
  return 1;
}

export type GrantCheck =
  | { ok: true }
  | { ok: false; reason: "no-renewal" | "already" };

/**
 * هل ينفع نفعّل لفّة دلوقتي؟
 *
 * @param lastRenewalAt وقت **آخر** تجديد للمندوب (من `subscription_events`).
 * @param grantKey      التجديد اللي اتفعّلت عليه آخر لفّة (متخزّن على المندوب).
 */
export function canGrantSpin(
  lastRenewalAt: string | null,
  grantKey: string | null,
): GrantCheck {
  if (!lastRenewalAt) return { ok: false, reason: "no-renewal" };
  if (grantKey && grantKey === lastRenewalAt) return { ok: false, reason: "already" };
  return { ok: true };
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toArabicDigits = (n: number): string =>
  String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);

/** «يوم» / «يومين» / «٣ أيام» — الصيغة العربية الصح. */
export function daysWord(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  return `${toArabicDigits(n)} أيام`;
}
