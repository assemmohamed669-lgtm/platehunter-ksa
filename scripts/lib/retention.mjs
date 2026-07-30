/** أسماء مجلدات النسخ: ٢٠٢٦-٠٧-٣٠_٢٣-٠٠ — الترتيب الأبجدي = الترتيب الزمني. */
const STAMP = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;

/**
 * بيحدّد مجلدات النسخ اللي تتمسح، ويسيب أحدث `keep` منها.
 *
 * كل نسخة ~٣٠ ميجا، فنسخة يومية بلا تنظيف بتملّي المساحة والنسخة تفشل
 * بالصمت. أي اسم مش على صيغة الطابع الزمني **مايتمسحش أبداً** — مجلد أو ملف
 * تايه جانب النسخ مايستاهلش يضيع بسبب تنظيف.
 *
 * @param {string[]} names أسماء المجلدات جوّه مجلد النسخ.
 * @param {number} keep عدد النسخ المحتفظ بيها. صفر أو أقل = مانمسح حاجة.
 * @returns {string[]} اللي يتمسح، من الأقدم للأحدث.
 */
export function foldersToPrune(names, keep) {
  if (!Number.isFinite(keep) || keep <= 0) return [];

  const stamps = names.filter((n) => STAMP.test(n)).sort();
  if (stamps.length <= keep) return [];

  return stamps.slice(0, stamps.length - keep);
}
