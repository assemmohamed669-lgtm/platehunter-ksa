/**
 * ملفات التشييك المتعددة — الأساسي + أي ملفات إضافية، كأنهم **شيت واحد**.
 *
 * ليه: بتنزل إحالة أو اتنين جداد مش موجودين في ملف التشييك المرفوع. بدل ما
 * المندوب يستنى ملف تشييك جديد، بيرفعهم في مربعات إضافية والبرنامج يتعامل مع
 * الكل كشيت واحد — يدوي وصوتي وكاميرا وشاص، وأي تطابق في أي ملف = «مطلوبة».
 *
 * كل ملف بيتقري **بعمود لوحته هو** (الكشف بالمحتوى) عشان ملفات بأسماء أعمدة
 * مختلفة (عربي/إنجليزي بنكي) تشتغل مع بعض من غير ما المندوب يظبّط حاجة.
 */
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "./plateParser";

export interface CheckSource {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * فهرس واحد (لوحة مطبّعة → صف) من كل ملفات التشييك.
 * الترتيب مهم: **الأول بيكسب** — فالملف الأساسي بياناته هي المرجع لو نفس
 * اللوحة موجودة في أكتر من ملف.
 */
export function buildCombinedCheckIndex(
  sources: CheckSource[],
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const src of sources) {
    if (!src || src.headers.length === 0 || src.rows.length === 0) continue;
    const col = detectPlateColumn(src.headers, src.rows);
    if (!col) continue;
    for (const row of src.rows) {
      const key = normalizePlate(bankPlateToArabic(String(row[col] ?? "")));
      if (key && !map.has(key)) map.set(key, row);   // الأول يكسب
    }
  }
  return map;
}
