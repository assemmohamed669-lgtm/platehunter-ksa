/**
 * تلوين اللوحات المكررة — منطق خالص (بدون JSX) عشان يتغطّى باختبارات.
 *
 * الفكرة: أي لوحة اتشيّكت أكتر من مرة (بأي طريقة: يدوي/صوت/كاميرا/شاص أو في
 * السجلات) تاخد **لون خاص بيها**، وكل لوحة مكررة بلون مختلف — ونفس اللون يتكرر
 * في كل النوافذ عشان المندوب يعرف إن السيارة ليها أكتر من موقع/سبق تشييكها.
 */

/**
 * يرجّع خريطة: مفتاح اللوحة → رقم اللون (0..paletteSize-1)، **للمكرر فقط**
 * (اللي ظهر أكتر من مرة). اللوحة اللي ظهرت مرة واحدة مش في الخريطة (بلا لون).
 *
 * ترتيب الألوان بترتيب أول ظهور — فاللون ثابت مايتغيّرش مع كل إعادة رسم.
 * المفاتيح الفاضية بتتجاهل.
 */
export function buildDupeColorMap(keys: string[], paletteSize: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const map = new Map<string, number>();
  if (paletteSize <= 0) return map;
  let ci = 0;
  for (const [k, c] of counts) {
    if (c > 1) {
      map.set(k, ci % paletteSize);
      ci++;
    }
  }
  return map;
}
