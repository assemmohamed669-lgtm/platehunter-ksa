/**
 * 📁 **اسم الملف اللي المندوب بيشاركه = نوع الفرز + تاريخ اليوم اللي فرز فيه.**
 *
 * طلب المالك (٣٠ سبتمبر ٢٠٢٦): «فرز جديد» ⇒ «نتيجة فرز جديد + التاريخ»، «فرز كلي»
 * ⇒ «فرز كلي + التاريخ»، «لصق نصي» ⇒ «لصق نصي + التاريخ»، سجلاتهم ⇒ «نصي سجلات» /
 * «كلي السجلات» … وصفحة المطلوب ⇒ «فرز الداتا على التشييك + التاريخ».
 *
 * ⚠️ الاسم **عربي + إنجليزي**: مشاركة الأندرويد بتبوظ مع اسم ملف عربي (قرار ٥
 * يوليو ٢٠٢٦ — `toSafeCacheFilename` بيشيل العربي)، فالملفات كانت بتوصل «file.xlsx».
 * الجزء الإنجليزي هو اللي بيفضل على الموبايل (`full-sort-30-09-2026.xlsx`)،
 * والعربي بيبان في المتصفّح.
 */
export type ShareKind =
  | "new" | "full" | "newAll" | "fullAll" | "newRecords" | "fullRecords"
  | "paste" | "pasteRecords" | "wanted";

const NAMES: Record<ShareKind, [ar: string, en: string]> = {
  new: ["نتيجة فرز جديد", "new-sort"],
  full: ["فرز كلي", "full-sort"],
  newAll: ["كل نتايج فرز جديد", "all-new-sort"],
  fullAll: ["كل نتايج فرز كلي", "all-full-sort"],
  newRecords: ["جديد السجلات", "new-sort-records"],
  fullRecords: ["كلي السجلات", "full-sort-records"],
  paste: ["لصق نصي", "paste"],
  pasteRecords: ["نصي سجلات", "paste-records"],
  wanted: ["فرز الداتا على التشييك", "data-vs-check"],
};

/** يوم-شهر-سنة لليوم اللي اتفرز فيه (أو النهارده لو مش معروف). */
export function shareDate(when?: string | Date | null): string {
  let d = when ? new Date(when) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** اسم الملف (من غير الامتداد): «فرز كلي full-sort 30-09-2026». */
export function shareFileName(kind: ShareKind, when?: string | Date | null, extra?: string): string {
  const [ar, en] = NAMES[kind];
  return `${ar}${extra ? ` ${extra}` : ""} ${en} ${shareDate(when)}`;
}
