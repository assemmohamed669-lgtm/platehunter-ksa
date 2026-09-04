/**
 * منطق سحب بطاقة اللوحة في التشييك الصوتي — نقي وقابل للقياس.
 *
 * البطاقة بتعرض **رقم اللوحة بس** بخط كبير. باقي البيانات (الحالة/النوع/الحي/
 * الملاحظات/الأعمدة الإضافية/الموقع/التاريخ) مخبّية ورا سحبة **لليسار**.
 * الدوال هنا بتجاوب على تلات أسئلة بس، عشان مكوّن الواجهة يفضل رفيّع:
 *   1. الحركة دي سحب أفقي ولا تمرير رأسي للقائمة؟
 *   2. البطاقة تتزحزح قد إيه دلوقتي؟
 *   3. لما الصباع يسيب: تفتح ولا تقفل؟
 */

/** أقصى انكشاف = ٨٥٪ من عرض البطاقة — بيسيب طرف اللوحة باين فالمندوب يعرف هو فين. */
export const REVEAL_MAX_RATIO = 0.85;

/** أقل مسافة تعتبر سحب — أقل من كده ضغطة عادية (تعديل/تحديد). */
const MIN_DRAG_PX = 6;

/** الأفقي لازم يبقى أوضح من الرأسي بالفرق ده، وإلا القائمة هي اللي تتمرّر. */
const HORIZONTAL_BIAS = 1.2;

/** نص المسافة = نقطة الحسم لما مافيش سرعة تُذكر. */
const SETTLE_RATIO = 0.5;

/** سرعة (بكسل/مللي) تكفي تحسم الاتجاه لوحدها — سحبة سريعة قصيرة. */
const FLICK_VELOCITY = 0.5;

/**
 * الحركة دي سحب أفقي؟ لازم تعدّي حد أدنى **وتكون** أوضح من الحركة الرأسية،
 * وإلا القائمة الرأسية بتبقى صعبة التمرير على الموبايل.
 */
export function isHorizontalDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) >= MIN_DRAG_PX && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS;
}

/**
 * إزاحة البطاقة الحالية بالبكسل (سالب = مزاحة لليسار = البيانات بتبان).
 * محدودة بين ٠ (مقفولة) و−أقصى انكشاف، فمافيش سحب في الفراغ.
 */
export function clampReveal(dx: number, wasOpen: boolean, width: number): number {
  const max = width * REVEAL_MAX_RATIO;
  const base = wasOpen ? -max : 0;
  return Math.min(0, Math.max(-max, base + dx));
}

/**
 * القرار عند رفع الصباع. `velocity` بالبكسل/مللي (سالب = بيتحرك لليسار).
 * السرعة بتغلب المسافة — عشان السحبة السريعة القصيرة تشتغل زي المتوقّع.
 */
export function settleReveal(
  offset: number,
  width: number,
  velocity: number,
  wasOpen: boolean
): boolean {
  if (velocity <= -FLICK_VELOCITY) return true;   // اندفاعة يسار = افتح
  if (velocity >= FLICK_VELOCITY) return false;   // اندفاعة يمين = اقفل
  const max = width * REVEAL_MAX_RATIO;
  if (max <= 0) return wasOpen;
  return Math.abs(offset) >= max * SETTLE_RATIO;
}
