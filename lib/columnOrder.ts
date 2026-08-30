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
 * ترتيب أعمدة النتيجة في **الوضع المخصّص**: الثابت المتاح (نوع السيارة › الماركة)
 * + اللي المندوب اختاره بترتيبه، وبس (اللي ماختارهوش مايظهرش). رقم اللوحة مش هنا
 * — بيتعرض منفصل قبلهم. (الوضع «الأساسي» بيتعامل معاه المستدعي مباشرة بكل الأعمدة
 * الافتراضية، مش من هنا.)
 */
export function orderedLabels(availableLabels: string[], order: string[]): string[] {
  const avail = new Set(availableLabels);
  const fixed = FIXED_LEADING_LABELS.filter((l) => avail.has(l));
  const fixedSet = new Set(fixed);
  const optional = order.filter((l) => avail.has(l) && !fixedSet.has(l));
  const seen = new Set<string>();
  return [...fixed, ...optional].filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
}

/** وضع عرض الأعمدة: «أساسي» = ترتيب البرنامج الافتراضي (كل الأعمدة المفيدة زي
 *  الأول)؛ «مخصّص» = اللي المندوب اختاره ورتّبه بإيده. */
export type OrderMode = "basic" | "custom";
const MODE_KEY = "ph:sorting:colMode";

/** الوضع المحفوظ — الافتراضي «أساسي» لأي مندوب جديد أو مالمسش الإعداد. */
export function loadOrderMode(): OrderMode {
  try { return localStorage.getItem(MODE_KEY) === "custom" ? "custom" : "basic"; } catch { return "basic"; }
}
export function saveOrderMode(m: OrderMode): void {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable */ }
}

/** بدّل ظهور عمود في الترتيب: مش موجود → يتضاف آخر القائمة؛ موجود → يتشال. */
export function toggleColumn(order: string[], label: string): string[] {
  return order.includes(label) ? order.filter((l) => l !== label) : [...order, label];
}
