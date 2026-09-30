import { detectArabicPlateColumn, detectPlateColumn } from "./plateParser";

/**
 * 📋 **أعمدة نتيجة «لصق نصي» من الصفوف اللي اتطابقت فعلاً** — أي مصدر كان.
 *
 * بلاغ المالك (٣٠ سبتمبر ٢٠٢٦): اللوحات بتطلع من غير بياناتها. الأعمدة كانت
 * هيدرز ملف الداتا **الأساسي** بس، واللوحات ممكن تتطابق من مصدر تاني (داتا
 * المجموعة / مربع داتا إضافي) بأعمدته هو ⇒ خانات فاضية.
 *
 * الصفوف بتتقسّم بشكل أعمدتها (كل مصدر ليه شكل)، وعمود اللوحة بتاع كل مصدر
 * بيتشال (رقم اللوحة بيتعرض لوحده أول عمود). الترتيب = ترتيب ظهور الأعمدة.
 */
export function pasteColumnsOf(rows: Record<string, string>[]): string[] {
  const groups = new Map<string, { keys: string[]; sample: Record<string, string>[] }>();
  const order: string[] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const sig = keys.join("\u0001");
    let g = groups.get(sig);
    if (!g) { g = { keys, sample: [] }; groups.set(sig, g); order.push(sig); }
    if (g.sample.length < 50) g.sample.push(row);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sig of order) {
    const { keys, sample } = groups.get(sig)!;
    const plate = detectArabicPlateColumn(keys) ?? detectPlateColumn(keys, sample);
    for (const k of keys) {
      if (k === plate || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
