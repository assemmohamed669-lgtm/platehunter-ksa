/**
 * مكان فريد وثابت (slot) لكل ملف داتا إضافي كبير بيتقرا على دفعات (`xdata-N`).
 *
 * عدّاد دائم في localStorage عشان مايتكررش عبر إعادة فتح التطبيق (لو استخدمنا معرّف المربع
 * كان يتصادم لأن عدّاد المعرّفات بيتصفّر عند كل فتح) — فمافيش ملف بيمسح ملف تاني بالغلط.
 * نفس العدّاد لصفحة الفرز ولنافذة «افتح الملف في» (ملف جاي من واتساب).
 */
export function nextStreamSlot(): string {
  let seq = 1;
  try {
    seq = (parseInt(localStorage.getItem("ph:sorting:xdataSeq") || "0", 10) || 0) + 1;
    localStorage.setItem("ph:sorting:xdataSeq", String(seq));
  } catch { seq = Math.floor(Math.random() * 1e9); }
  return `xdata-${seq}`;
}

/**
 * ✏️ الملف المحفوظ لمربع داتا إضافي (`data-2`، `data-3`…) — المالك (١٨ أكتوبر ٢٠٢٦): «عايز كل واحده تبقي خاصه ب مربعها
 * والتعديل فيها ل وحدها». الملفات بتتحفظ **مرصوصة** (`persistExtraDataSlots` في الفرز بيتخطّى المربع الفاضي)، فرقم الملف
 * = عدد المربعات المليانة قبله + ٢ — مش مكان المربع في الشاشة. المربع نفسه فاضي ⇒ null.
 */
export function savedExtraDataSlot(boxes: readonly { table: unknown; file: unknown }[], i: number): string | null {
  const box = boxes[i];
  if (!box || !box.table || !box.file) return null;
  let filledBefore = 0;
  for (let k = 0; k < i; k++) if (boxes[k]?.table && boxes[k]?.file) filledBefore++;
  return `data-${filledBefore + 2}`;
}
