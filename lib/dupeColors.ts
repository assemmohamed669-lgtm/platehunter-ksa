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
/**
 * نفس الفكرة بس بـ**نطاقات منفصلة** (كل نافذة/شيت نطاق): اللوحة تتعدّ مكررة لو
 * ظهرت أكتر من مرة **جوّه نطاق واحد** — مش بجمع النطاقات مع بعضها.
 *
 * ليه؟ لأن نفس التشييك بيعيش في مكانين: قائمة الشغل (صوت/كاميرا) **و** شيت
 * السجلات بعد ما يتصدّر. لو جمعنا النطاقات، اللوحة الواحدة تتحسب مرتين وتطلع
 * «مكررة» وهي متشيّكة مرة واحدة (تلوين كاذب). بالنطاقات: لوحة اتقالت مرتين في
 * نفس الجلسة → مكررة ✓، ولوحة ليها سجلين في الشيت → مكررة ✓، ولوحة مرة واحدة
 * موجودة في القائمة وفي الشيت → **مش** مكررة ✓.
 *
 * اللون ثابت لكل لوحة (بترتيب أول ظهور) فنفس اللوحة بتاخد نفس اللون في كل نافذة.
 */
export function buildScopedDupeColorMap(scopes: string[][], paletteSize: number): Map<string, number> {
  const map = new Map<string, number>();
  if (paletteSize <= 0) return map;
  let ci = 0;
  for (const keys of scopes) {
    const counts = new Map<string, number>();
    for (const k of keys) {
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, c] of counts) {
      if (c > 1 && !map.has(k)) {
        map.set(k, ci % paletteSize);
        ci++;
      }
    }
  }
  return map;
}

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
