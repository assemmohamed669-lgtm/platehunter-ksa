/**
 * plateLocator — «أنا عايز أحط الإضافة تحت اللوحة دي بالظبط».
 *
 * المندوب بيدوّر على لوحة في ملف الداتا، البرنامج بيوريه صفها كامل ومعاها
 * ١٠ سيارات قبلها و١٠ بعدها، ويقوله اللوحة دي ظهرت كام مرة — فيقدر يلف على
 * المرات لحد ما يوصل للمكان اللي هو قاصده ويعلّم عليه.
 */

import { normalizePlate, bankPlateToArabic } from "./plateParser";

/** تطبيع للمقارنة — بيمشّي محافظ البنوك الإنجليزية كمان. */
function key(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return normalizePlate(bankPlateToArabic(s));
}

/** كل الصفوف اللي فيها اللوحة دي، بالترتيب. بحث فاضي أو عمود غلط → فاضي. */
export function findPlateRows(
  rows: Record<string, unknown>[],
  plateCol: string,
  query: string,
): number[] {
  const q = key(query);
  if (!q || !plateCol) return [];
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (key(rows[i]?.[plateCol]) === q) out.push(i);
  }
  return out;
}

/** أرقام صفوف النافذة: `span` قبل و`span` بعد، من غير ما تخرج عن الملف. */
export function contextWindow(hit: number, total: number, span = 10): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, hit - span); i <= Math.min(total - 1, hit + span); i++) out.push(i);
  return out;
}

/** المرة اللي بعدها — وبعد الأخيرة بيرجع لأول واحدة. */
export function nextOccurrence(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}
