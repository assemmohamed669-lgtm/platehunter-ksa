/**
 * 🎨 تلوين اللوحات المكررة في Voice PRO — منطق خالص عشان يتغطّى باختبارات.
 *
 * المالك (٢٦ سبتمبر ٢٠٢٦): «لو اللوحة اتكررت مرتين أو أكتر… يتلوّن اللاين بتاع
 * اللوحتين أو التلاتة اللي شبه بعض بلون علشان المندوب يعرف إنها مكررة، ولو فيه
 * لوحة درن1452 وليها متشابه يتلوّن بلون تاني وهكذا».
 *
 * - **المكرر = نفس اللوحة بالحرف** بعد التطبيع (`plateKey`: المسافات وأ/ا والإنجليزي
 *   مابيفرّقوش) — زي «صوتي» بالظبط. لوحات الأسطول (حبل1211/حبل1212) عربيات
 *   مختلفة فمابتتلوّنش.
 * - **اللون ثابت**: المجموعة اللي خدت لون بتفضل بيه طول ما هي مكررة، حتى لو ظهرت
 *   مجموعة جديدة أو اتمسحت مجموعة تانية — عشان الألوان ماتتنططش قدام المندوب.
 */

/** لون مجموعة مكررة: خلفية الصف + شارة «مكررة ×N». */
export interface DupPaletteEntry { row: string; chip: string }

/**
 * ٨ ألوان واضحة على الشكلين (العادي والفخم). **مفيش أحمر** (ده لون المطلوبة)
 * **ولا أصفر** (ده لون المبدئية) عشان المندوب مايتلخبطش.
 *
 * 📏 **متختارة بالقياس مش بالعين**: أحسن ٨ من ألوان Tailwind بشفافية ٢٥٪ على
 * الأبيض وعلى الغامق (ΔE — مسافة اللون زي ما العين بتشوفها). أقرب لونين في
 * الطقم ΔE ≈ ١٢.٨. الطقم الأول (بنفسجي/نيلي وفيروزي/زمردي) كان ٤.٧ — يعني
 * مجموعتين مختلفتين كانوا بيبانوا نفس اللون. والترتيب بيخلّي أول المجموعات
 * (الأكتر ظهوراً) هي الأبعد عن بعض.
 * (الكلاسات مكتوبة كاملة عشان Tailwind يلاقيها.)
 */
export const VOICE_PRO_DUP_PALETTE: readonly DupPaletteEntry[] = [
  { row: "bg-orange-500/25", chip: "bg-orange-600" },
  { row: "bg-purple-500/25", chip: "bg-purple-600" },
  { row: "bg-cyan-500/25", chip: "bg-cyan-600" },
  { row: "bg-lime-500/25", chip: "bg-lime-600" },
  { row: "bg-blue-500/25", chip: "bg-blue-600" },
  { row: "bg-stone-500/25", chip: "bg-stone-600" },
  { row: "bg-pink-500/25", chip: "bg-pink-600" },
  { row: "bg-green-500/25", chip: "bg-green-600" },
];

/** علامة المجموعة: رقم اللون + عدد مرات التكرار. */
export interface DupMark { color: number; count: number }

/**
 * @param keys مفاتيح اللوحات (`plateKey`) **من الأقدم للأحدث** — ترتيب أول ظهور
 *   بيحدّد لون المجموعات الجديدة.
 * @param prev ألوان المرة اللي فاتت (مفتاح → لون) — المجموعة اللي لسه مكررة
 *   بتحتفظ بلونها.
 * @returns مفتاح → علامة، **للمكرر بس** (اللي ظهر مرتين أو أكتر).
 */
export function assignDupColors(
  keys: readonly string[],
  prev: ReadonlyMap<string, number>,
  paletteSize: number,
): Map<string, DupMark> {
  const out = new Map<string, DupMark>();
  if (paletteSize <= 0) return out;

  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const raw of keys) {
    const k = String(raw ?? "").trim();
    if (!k) continue;
    if (!counts.has(k)) order.push(k);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dups = order.filter((k) => (counts.get(k) ?? 0) > 1);

  // ① اللي كان ليه لون بيحتفظ بيه — **حتى لو مجموعة تانية شاركته** (الألوان لفّت
  //    بعد ٨ مجموعات). لو اشترطنا إن اللون مايتشاركش، مجموعة من الاتنين كانت
  //    بتتنقل لون تاني مع أي إعادة رسم (المراجعة لقت تبديل ×٢ بين مجموعتين قديمتين).
  const uses = new Array<number>(paletteSize).fill(0);
  const fresh: string[] = [];
  for (const k of dups) {
    const c = prev.get(k);
    if (c !== undefined && Number.isInteger(c) && c >= 0 && c < paletteSize) {
      out.set(k, { color: c, count: counts.get(k) as number });
      uses[c]++;
    } else {
      fresh.push(k);
    }
  }
  // ② الجديد ياخد أقل لون مستخدم (الفاضي الأول) — ولو الألوان خلصت بيلفّ
  for (const k of fresh) {
    let best = 0;
    for (let c = 1; c < paletteSize; c++) if (uses[c] < uses[best]) best = c;
    out.set(k, { color: best, count: counts.get(k) as number });
    uses[best]++;
  }

  // الترتيب بترتيب أول ظهور (مش مهم للعرض، بس بيسهّل القراءة)
  const sorted = new Map<string, DupMark>();
  for (const k of dups) sorted.set(k, out.get(k) as DupMark);
  return sorted;
}
