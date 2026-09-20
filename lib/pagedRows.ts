/**
 * ترقيم بسيط لصفوف الجداول الطويلة (سجلات التشييك).
 *
 * الخلفية: جدول السجلات كان بيرسم **كل** الصفوف مرة واحدة. مندوب عنده ٦٠٠٠
 * سجل → عشرات الآلاف من عناصر الصفحة في وقت واحد، وفوقهم ملف تشييك بعشرات
 * الآلاف من الصفوف في الذاكرة → سفاري على الأيفون بيقتل الصفحة ويطلّع «حدثت
 * مشكلة بشكل متكرر»، والمندوب يفتح تاني يلاقي السجلات فاضية لأن التحميل
 * مخلّصش أصلاً.
 *
 * الحل: نرسم دفعة أولى خفيفة، والباقي بيتحمّل لوحده مع التمرير. العدّادات
 * والبحث والتصدير والمشاركة بتفضل شغالة على **كل** الصفوف — الحد على الرسم بس.
 */

/** حجم الدفعة الواحدة — أول رسم وكل زيادة بعده. */
export const PAGE_STEP = 300;

/** الصفوف المعروضة حالياً (بترتيبها، بنقص من الآخر). */
export function pageSlice<T>(rows: T[], shown: number): T[] {
  return rows.length <= shown ? rows : rows.slice(0, Math.max(0, shown));
}

/** لسه فيه صفوف مخفية؟ */
export function hasMore(total: number, shown: number): boolean {
  return total > shown;
}

/** يزوّد دفعة من غير ما يعدّي الإجمالي. */
export function growShown(total: number, shown: number, step = PAGE_STEP): number {
  return Math.min(total, shown + step);
}

/** يرجّع لأول دفعة — بعد أي بحث أو تغيير فلتر. */
export function resetShown(total: number, step = PAGE_STEP): number {
  return Math.min(total, step);
}

/**
 * نافذة الرسم لما يبقى فيه صف **مطلوب إنه يبان** (نتيجة بحث بنتنطّ عليها).
 *
 * كنا بنوسّع الدفعة لحد الصف المطابق (`slice(0, idx + 1)`) — يعني اللوحة رقم
 * ١٢ ألف بترسم ١٢ ألف صف بخانات إدخال في لحظة واحدة والبرنامج يهنّج. بدل كده
 * بنرسم **نافذة حواليه**: `lead` صف قبله (السياق) ودفعة بعده، وبتكبر لتحت
 * عادي مع التمرير.
 *
 * @param focusIdx مكان الصف المطابق، أو `-1` لو مافيش بحث (السلوك العادي).
 */
export function focusWindow(
  total: number,
  shown: number,
  focusIdx: number,
  lead = 50,
): { start: number; end: number } {
  const page = Math.max(0, shown);
  if (focusIdx < 0 || focusIdx >= total) return { start: 0, end: Math.min(total, page) };
  const start = Math.max(0, focusIdx - lead);
  return { start, end: Math.min(total, Math.max(focusIdx + 1, start + page)) };
}
