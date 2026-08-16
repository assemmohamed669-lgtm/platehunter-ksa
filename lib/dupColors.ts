/**
 * تلوين اللوحات المكررة في نتيجة الفرز.
 *
 * الفرز بيطلّع نافذتين — نتيجة الداتا ونتيجة السجلات — والمشاركة بتحطهم في
 * **نفس الإكسيل**. فاللون لازم يتحسب على **الاتنين مع بعض**: اللوحة اللي ظهرت
 * في الداتا وكمان في السجلات دي أهم حالة للمندوب، وكانت بتفوت بلا لون لأن
 * صفوف السجلات كانت بتاخد null والخريطة متبنية من الداتا لوحدها.
 *
 * منطق نقي عشان يتغطّى باختبارات — الصفحة بتعرض بس.
 */

/**
 * بيرجّع رقم لون لكل لوحة **اتكررت**، سواء جوّه قايمة واحدة أو عبر القوايم.
 * اللي ظهر مرة واحدة مابياخدش لون. الترتيب بترتيب أول ظهور.
 */
export function combinedDupColorMap(
  keyLists: readonly (readonly string[])[],
  paletteSize: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const list of keyLists ?? []) {
    for (const raw of list ?? []) {
      const k = String(raw ?? "").trim();
      if (!k) continue;
      if (!counts.has(k)) order.push(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const map = new Map<string, number>();
  let ci = 0;
  for (const k of order) {
    if ((counts.get(k) ?? 0) > 1) { map.set(k, ci % paletteSize); ci++; }
  }
  return map;
}
