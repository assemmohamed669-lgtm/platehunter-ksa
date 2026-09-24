/**
 * wantedRowDetails — بيانات اللوحة المطلوبة **كاملة** في صفحة «مطلوبة اتلاقت».
 *
 * 🔴 الجدول كان بيعرض ٦ خانات بس (النوع · الشارع · الحي · التاريخ · ملاحظات ·
 * GPS) وبيرمي باقي صف السجل، و**مابيلمسش المحفظة خالص**. فالمندوب بيشوف إن
 * العربية مطلوبة ويروح لها وهو مش عارف موديلها ولا لونها ولا سنة صنعها —
 * وهي بيانات موجودة عندنا في ملف التشييك ومربوطة باللوحة.
 *
 * الدمج هنا بياخد الاتنين: صف السجل (اللي المندوب شافه في الميدان) + صف
 * المحفظة المطابق للوحة (طراز · لون · سنة الصنع · أي عمود تاني في الشيت).
 */

/**
 * الأعمدة اللي الجدول بيعرضها في خانات ثابتة — تكرارها بيضيّع عرض الشاشة على
 * تليفون. بنستبعدها من الأعمدة الزيادة بس بنسيبها في الصف نفسه.
 */
const ALREADY_SHOWN = [
  "رقم اللوحة", "اللوحة", "التاريخ", "ملاحظات",
];

function isShown(col: string): boolean {
  const c = col.trim();
  return ALREADY_SHOWN.some((k) => c === k);
}

/**
 * بيدمج صف السجل مع صف المحفظة في كائن واحد للعرض.
 *
 * ⚠️ **صف السجل بيكسب** لو نفس اسم العمود موجود في الاتنين — اللي المندوب شافه
 * في الميدان أحدث من اللي في المحفظة.
 * والخانات الفاضية بتتشال عشان ماتزحمش الجدول بأعمدة كلها «—».
 */
export function wantedExtraValues(
  recordRow: Record<string, string> | null | undefined,
  walletRow: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (src: Record<string, string> | null | undefined, overwrite: boolean) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      const key = String(k).trim();
      const val = String(v ?? "").trim();
      if (!key || !val || isShown(key)) continue;
      if (!overwrite && key in out) continue;
      out[key] = val;
    }
  };
  put(walletRow, false);   // المحفظة الأول…
  put(recordRow, true);    // …والسجل بيغلب عليها
  return out;
}

/**
 * كل أعمدة العرض من كل الصفوف، **بترتيب أول ظهور** وبلا تكرار — عشان الجدول
 * يفضل ثابت الشكل مهما اختلفت الصفوف عن بعضها.
 */
export function wantedExtraColumns(rows: Record<string, string>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
