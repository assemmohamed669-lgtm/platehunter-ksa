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
