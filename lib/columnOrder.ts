/**
 * ترتيب أعمدة نتيجة الفرز اللي المندوب بيختاره — بيتحفظ على الجهاز وبيطبّق على
 * **كل** حتة: نتيجة الفرز في البرنامج، الإكسيل، الصورة، كل أنواع الفرز، وصفحة
 * المطلوب. مصدر واحد للترتيب عشان كله متسق.
 *
 * القاعدة:
 *  • «رقم اللوحة» دايماً أول عمود (بيتعرض منفصل، مش هنا).
 *  • بعده أعمدة **ثابتة** (نوع السيارة › الماركة) — مايتحركوش ومايتشالوش، بيظهروا
 *    لو موجودين في الملف.
 *  • بعدهم الأعمدة اللي المندوب اختار يظهّرها **بترتيب اختياره**. لو ماختارش
 *    حاجة → الثابت بس هو اللي يظهر.
 */

/** الأعمدة الثابتة بعد رقم اللوحة (بالـlabels) — بترتيبها، مايتحركوش. */
export const FIXED_LEADING_LABELS = ["نوع السيارة", "الماركة"];

const KEY = "ph:sorting:colOrder";

/** الأعمدة الاختيارية اللي المندوب اختار يظهّرها بترتيبه. [] = مفيش (الثابت بس). */
export function loadColumnOrder(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export function saveColumnOrder(order: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* storage unavailable */ }
}

/** الأعمدة الاختيارية المتاحة للاختيار = كل المتاح ناقص الثابت (وناقص رقم اللوحة). */
export function optionalAvailable(availableLabels: string[]): string[] {
  const fixed = new Set([...FIXED_LEADING_LABELS, "رقم اللوحة"]);
  const seen = new Set<string>();
  return availableLabels.filter((l) => !fixed.has(l) && (seen.has(l) ? false : (seen.add(l), true)));
}

/**
 * الترتيب النهائي للأعمدة المعروضة (بالـlabels): الثابت المتاح + المختار المتاح
 * بترتيبه، بلا تكرار. لو `order` فاضي → الثابت بس. (رقم اللوحة مش هنا — بيتعرض
 * منفصل قبلهم.)
 */
export function orderedLabels(availableLabels: string[], order: string[]): string[] {
  const avail = new Set(availableLabels);
  const fixed = FIXED_LEADING_LABELS.filter((l) => avail.has(l));
  const fixedSet = new Set(fixed);
  const optional = order.filter((l) => avail.has(l) && !fixedSet.has(l));
  const seen = new Set<string>();
  return [...fixed, ...optional].filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
}

/** بدّل ظهور عمود في الترتيب: مش موجود → يتضاف آخر القائمة؛ موجود → يتشال. */
export function toggleColumn(order: string[], label: string): string[] {
  return order.includes(label) ? order.filter((l) => l !== label) : [...order, label];
}
