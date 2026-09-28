/**
 * 📑 ترتيب نتيجة الفرز **بترتيب ورقات المندوب**.
 *
 * طلب المالك (٢٨ سبتمبر ٢٠٢٦): ملف داتا فيه ورقتين («داتا» و«داتا قديمه»)،
 * ولما المندوب يعلّم على الاتنين النتيجة كانت بتطلع بترتيب الملف نفسه. المطلوب:
 * «الورقه اللي يختارها الاول هيا اللي تظهر نتيجتها فوق، والتانية تحتها —
 * المندوب هو اللي يختار يدوي بإيده».
 *
 * السبب: `iterateRows` بيلفّ على الدفعات بترتيب تخزينها (= ترتيب الملف)،
 * واختيار الورقات بيفلتر بس ومابيرتّبش.
 *
 * ⚠️ الحل بيرتّب **مصفوفة النتيجة بس** — `dataIdx` بتفضل الموضع الفيزيائي في
 *    الملف، لأن «موقعها» (جيران نفس الشارع) بتعيد اللفّ على الملف وبتعتمد عليه.
 */

/**
 * بيرتّب كل **مجموعة متتالية** من نفس المصدر (ملف الداتا) بترتيب ورقاته.
 *
 * · مابينقلش صف من ملف لملف — كل ملف نافذته، وترتيب الملفات زي ما هو.
 * · جوّه الورقة الواحدة الترتيب زي ما هو (ترتيب الملف).
 * · صف ورقته مش في الترتيب (أو من غير ورقة، زي نتيجة قديمة مكاشة) بيفضل بعد
 *   المرتّب وبترتيبه الأصلي.
 * · من غير ترتيب (أقل من ورقتين) المجموعة بترجع زي ما هي بالظبط.
 */
export function orderRunsBySheet<T extends { sheet?: string }>(
  items: readonly T[],
  groupOf: (item: T) => number,
  orderOf: (group: number) => readonly string[] | null | undefined,
): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < items.length) {
    const group = groupOf(items[i]);
    let j = i + 1;
    while (j < items.length && groupOf(items[j]) === group) j++;
    const order = orderOf(group);
    if (order && order.length > 1) {
      const rank = new Map(order.map((name, k) => [name, k] as const));
      const keyed = items.slice(i, j).map((item, k) => ({
        item, k, r: (item.sheet != null ? rank.get(item.sheet) : undefined) ?? order.length,
      }));
      keyed.sort((a, b) => a.r - b.r || a.k - b.k);
      for (const x of keyed) out.push(x.item);
    } else {
      for (let k = i; k < j; k++) out.push(items[k]);
    }
    i = j;
  }
  return out;
}

/** بيحرّك ورقة خطوة لفوق (-1) أو لتحت (1) في الترتيب. الحافة/مش موجودة = زي ما هو. */
export function moveInOrder(order: readonly string[], name: string, dir: -1 | 1): string[] {
  const next = [...order];
  const i = next.indexOf(name);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
