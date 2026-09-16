/**
 * حلّ عمود اللوحة لملف داتا إضافي.
 *
 * ليه موجودة: `detectPlateColumn` **عمره ما بيرجّع `null`** — آخر احتياطي عنده
 * `headers[0]`. فملف الداتا الإضافي اللي الكشف بالمحتوى مالقاش فيه دليل واضح
 * كان بيتفرز على **أول عمود** في الملف، فمايطلّعش ولا نتيجة — لا في «جديد» ولا
 * «كلي» ولا اللصق النصي. وكل ده في صمت: المربع الأساسي فيه اختيار يدوي للعمود
 * والمربعات الإضافية مافيهاش، فالمندوب مش قادر يصلّحها ولا حتى يعرف إنها حصلت.
 *
 * القاعدة: الدليل الحقيقي الأول (عربي ثم محتوى)، وبعدين **عمود الملف الأساسي**
 * (اللي ممكن يكون المندوب اختاره بإيده) — الملفات الإضافية مفترض نفس الأعمدة —
 * وبعدين السلوك القديم كاحتياطي أخير عشان مافيش حاجة كانت شغّالة تقع.
 */
import { detectArabicPlateColumn, detectPlateColumn, detectPlateColumnByContent } from "./plateParser";

export function resolveDataPlateCol(
  headers: string[],
  rows: Record<string, string>[],
  /** عمود لوحة الملف الأساسي — الملفات الإضافية مفترض نفس الأعمدة. */
  fallbackCol: string | null,
): string | null {
  if (headers.length === 0) return null;
  // دليل حقيقي: عمود لوحاته بالحروف العربية، وإلا عمود محتواه لوحات فعلاً.
  const byArabic = detectArabicPlateColumn(headers);
  if (byArabic) return byArabic;
  const byContent = detectPlateColumnByContent(headers, rows);
  if (byContent) return byContent;
  // مفيش دليل — عمود الأساسي أوثق بكتير من «أول عمود».
  if (fallbackCol && headers.includes(fallbackCol)) return fallbackCol;
  // آخر حاجة: السلوك القديم (اسم العمود ثم تمريرة ضعيفة ثم أول عمود).
  return detectPlateColumn(headers, rows);
}
