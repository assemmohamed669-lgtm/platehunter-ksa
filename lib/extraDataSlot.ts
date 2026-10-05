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
