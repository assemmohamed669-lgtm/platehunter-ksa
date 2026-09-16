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

/** مجموعة لوحات التشييك المطبّعة من كل الملفات — لفلتر «فرز جديد». */
export function combinedCheckPlates(sources: CheckSource[]): Set<string> {
  return new Set(buildCombinedCheckIndex(sources).keys());
}

/**
 * بيقرا ملف التشييك الأساسي + كل الملفات الإضافية من التخزين المحلي.
 * القراءة بتقف عند أول سلوت فاضي، عشان كده الترقيم لازم يفضل متتابع.
 */
export async function loadAllCheckSources(): Promise<CheckSource[]> {
  const { getUploadedFile } = await import("./idb");
  const out: CheckSource[] = [];
  const main = await getUploadedFile("local", "check").catch(() => null);
  if (main) out.push({ headers: main.headers, rows: main.rows });
  for (let n = 2; n < 100; n++) {
    const rec = await getUploadedFile("local", `check-${n}`).catch(() => null);
    if (!rec) break;
    out.push({ headers: rec.headers, rows: rec.rows });
  }
  return out;
}

/**
 * بيشيل مربع تشييك إضافي ويعيد ترقيم الباقي من ٢.
 *
 * السلوتات بتتقري وقت الفتح **بالتتابع لحد أول سلوت فاضي** — فلو المندوب شال
 * المربع اللي في النص، الثغرة بتخفي كل اللي بعده. عشان كده الترقيم بيتعاد بعد
 * أي مسح (مربع فاضي كان ولا فيه ملف).
 */
export function renumberCheckSlots<T extends { id: number }>(boxes: T[], removeId: number): T[] {
  return boxes.filter((b) => b.id !== removeId).map((b, i) => ({ ...b, id: i + 2 }));
}
