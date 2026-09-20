/**
 * sortingDataBox — هل الداتا اللي في «رفع للداتا» هي نفسها اللي في مربع الداتا
 * بتاع صفحة الفرز؟
 *
 * ليه: المندوب بيدمج التفريغ في ملف الداتا، وبعدين محتاج يعرف هو بيحدّث نسخة
 * موجودة عنده ولا بينقل ملف جديد للفرز. المطابقة بالاسم مش بعدد الصفوف — الدمج
 * بيغيّر عدد الصفوف بطبيعته، فلو قارنّا بيه كل ملف مدموج هيبان «ملف تاني».
 */

/** البادئة اللي بنوسم بيها الملف بعد الدمج. */
export const MERGED_PREFIX = "داتا-محدّثة-";

/** بادئة متسامحة: «محدّثة/محدثه»، وتاريخ اختياري بعدها. */
const PREFIX_RE = /^\s*داتا-?\s*محد[ّ]?ث[ةه]-\s*(?:\d{4}-\d{2}-\d{2}-\s*)?/;

/** اسم الملف الأصلي — من غير بادئة الدمج مهما اتكررت. */
export function baseDataName(fileName: string): string {
  let n = String(fileName ?? "").trim();
  for (let i = 0; i < 10 && PREFIX_RE.test(n); i++) n = n.replace(PREFIX_RE, "").trim();
  return n;
}

/** اسم الملف بعد الدمج — البادئة بتتحط مرة واحدة بس مهما اتدمج تاني. */
export function mergedDataName(fileName: string): string {
  const base = baseDataName(fileName);
  return PREFIX_RE.test(String(fileName ?? "").trim()) ? String(fileName).trim() : `${MERGED_PREFIX}${base}`;
}

/** اللي في مربع الداتا بتاع صفحة الفرز دلوقتي. */
export interface SortingDataBox {
  fileName: string;
  rowCount: number;
}

/** الملف اللي فتحناه هنا هو نفسه اللي في مربع الفرز (ولو نسخة محدّثة منه)؟ */
export function sameDataFile(box: SortingDataBox | null, fileName: string): boolean {
  if (!box) return false;
  const a = baseDataName(box.fileName);
  const b = baseDataName(fileName);
  return a.length > 0 && a === b;
}
