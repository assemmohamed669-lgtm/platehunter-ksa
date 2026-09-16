/**
 * ترتيب أعمدة نتيجة الفرز اللي المندوب بيختاره — بيتحفظ على الجهاز وبيطبّق على
 * **كل** حتة: نتيجة الفرز في البرنامج، الإكسيل، الصورة، كل أنواع الفرز، وصفحة
 * المطلوب. مصدر واحد للترتيب عشان كله متسق.
 *
 * القاعدة:
 *  • «رقم اللوحة» دايماً أول عمود (بيتعرض منفصل، مش هنا).
 *  • كل باقي الأعمدة — **بما فيها نوع السيارة والماركة** — بترتيب المندوب
 *    بالظبط. كان العمودان دول مقفولين في الأول ومايتحركوش؛ المالك فكّ القفل
 *    عنهم (٦ سبتمبر ٢٠٢٦) عشان المندوب يحطّهم قبل أو بعد بعض براحته.
 *  • لو المندوب ماختارش حاجة خالص → بيظهروا هما الاتنين كافتراضي (زي ما كان)،
 *    فالمندوب الجديد مايلاقيش نتيجة برقم لوحة وبس.
 */

/** الافتراضي اللي بيظهر لو المندوب ماختارش أي عمود — مش مقفول، مجرد بداية. */
export const LEADING_DEFAULT_LABELS = ["نوع السيارة", "الماركة"];

const KEY = "ph:sorting:colOrder";
/** علامة ترحيل «فك القفل» — بتتعمل مرة واحدة لكل جهاز. */
const MIGRATED_KEY = "ph:sorting:colOrder:unlocked";

/** الأعمدة الاختيارية اللي المندوب اختار يظهّرها بترتيبه. [] = مفيش (الثابت بس). */
export function loadColumnOrder(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    const order = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];

    // ترحيل مرة واحدة: قبل فك القفل كان النوع والماركة بيتحطّوا في الأول
    // تلقائياً. من غير الترحيل ده كانوا هيختفوا فجأة من عند أي مندوب مرتّب
    // أعمدته خلاص — كسر لحاجة شغّالة.
    if (localStorage.getItem(MIGRATED_KEY) !== "1") {
      const migrated = migrateColumnOrder(order);
      localStorage.setItem(MIGRATED_KEY, "1");
      if (migrated.length !== order.length) { saveColumnOrder(migrated); return migrated; }
    }
    return order;
  } catch { return []; }
}

/**
 * ترحيل ترتيب متحفوظ من أيام القفل: بيحط النوع والماركة في أوله لو مش موجودين.
 * الترتيب الفاضي بيفضل فاضي — الافتراضي في `orderedLabels` بيتكفّل بيه.
 */
export function migrateColumnOrder(order: string[]): string[] {
  if (order.length === 0) return [];
  const have = new Set(order);
  return [...LEADING_DEFAULT_LABELS.filter((l) => !have.has(l)), ...order];
}

export function saveColumnOrder(order: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* storage unavailable */ }
}

/** الأعمدة المتاحة للترتيب = كل المتاح ناقص رقم اللوحة (بيتعرض منفصل دايماً). */
export function optionalAvailable(availableLabels: string[]): string[] {
  const seen = new Set<string>();
  return availableLabels.filter((l) => l !== "رقم اللوحة" && (seen.has(l) ? false : (seen.add(l), true)));
}

/**
 * ترتيب أعمدة النتيجة في **الوضع المخصّص**: اللي المندوب اختاره **بترتيبه
 * بالظبط** وبس — مافيش عمود مفروض في الأول. رقم اللوحة مش هنا (بيتعرض منفصل
 * قبلهم). لو ماختارش حاجة خالص → الافتراضي (نوع السيارة › الماركة) عشان
 * النتيجة ماتطلعش لوحة وبس. (الوضع «الأساسي» بيتعامل معاه المستدعي مباشرة.)
 */
export function orderedLabels(availableLabels: string[], order: string[]): string[] {
  const avail = new Set(availableLabels);
  const picked = order.length > 0 ? order : LEADING_DEFAULT_LABELS;
  const seen = new Set<string>();
  return picked.filter((l) => avail.has(l) && (seen.has(l) ? false : (seen.add(l), true)));
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
