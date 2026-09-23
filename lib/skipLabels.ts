/**
 * skipLabels — عدّاد «نوافذ اتخطّت» بلغة المندوب، ومقروء على شاشة تليفون.
 *
 * 🔴 العدّاد كان بيعرض المفاتيح الخام مربوطة في سطر واحد. ودي مشكلتين:
 *   ① مفاتيح بذيل رقمي (`empty_slice:44` · `empty_slice:120` …) بتولّد
 *      **مفتاح جديد لكل قيمة** ⇒ السطر بيتحوّل لحيطة نص والمندوب بيتجاهله.
 *   ② الأكواد إنجليزية، والمندوب اللي المفروض يصوّر الشاشة للإدارة مش فاهم
 *      يعني إيه `yield_to_utterance`.
 *
 * ⚠️ وكود فشل الطلب **بيفضل متفصّل عن قصد** (`http_503` غير `timeout` غير
 *    `network`): دي بالظبط التفرقة اللي بتحدّد الخطوة الجاية — ٥٠٣ معناه
 *    السيرفر مزنوق، والمهلة معناها الرفع بطيء. لمّهم = ضياع الإجابة.
 */

/** سبب تخطٍّ واحد بعد اللمّ والترجمة. */
export interface SkipLine {
  label: string;
  n: number;
}

/** الأسباب اللي ليها اسم عربي. أي مفتاح تاني بيظهر زي ما هو بدل ما يتبلع. */
const LABELS: Record<string, string> = {
  utterance_too_long: "نطق طويل (لوحات ورا بعض)",
  utterance_too_short: "نطق قصير",
  utterance_queue_full: "الطابور اتملى",
  busy_window: "الموديل مشغول",
  yield_to_utterance: "أفسحنا لقراءة النطق",
  silence_gate: "سكوت",
  too_short: "مقطع قصير",
  slice_failed: "القصّ فشل",
  empty_slice: "مقطع فاضي",
  utterance_dropped_legacy: "نطق اترمى (الوضع القديم)",
  "request_failed:http_503": "السيرفر مزنوق (503)",
  "request_failed:timeout": "مهلة الطلب خلصت",
  "request_failed:network": "الشبكة قطعت",
  "request_failed:bad_token": "التوكن مرفوض",
};

/**
 * المفاتيح اللي ذيلها **متغيّر** ولازم تتلمّ على البادئة.
 * `request_failed` مش منهم عن قصد — شوف التحذير فوق.
 */
const COLLAPSE_PREFIXES = ["empty_slice"];

/** يلمّ المفتاح الخام للمفتاح اللي هيتعدّ عليه. */
function collapseKey(raw: string): string {
  for (const p of COLLAPSE_PREFIXES) {
    if (raw === p || raw.startsWith(p + ":")) return p;
  }
  return raw;
}

/**
 * يحوّل عدّاد التخطّي الخام لسطور مقروءة، **مرتّبة من الأكتر للأقل** عشان
 * أهم رقم يبان الأول على شاشة ضيّقة.
 */
export function summarizeSkips(skips: Record<string, number>): SkipLine[] {
  const merged = new Map<string, number>();
  for (const [raw, n] of Object.entries(skips)) {
    if (!n) continue;
    const key = collapseKey(raw);
    merged.set(key, (merged.get(key) ?? 0) + n);
  }
  return [...merged.entries()]
    .map(([key, n]) => ({ label: LABELS[key] ?? key, n }))
    .sort((a, b) => b.n - a.n);
}
