/**
 * حروف نوع السيارة المختصرة (المندوب بيعرفها):
 *   و = ونيت • ن = نقل • ف = فان • ت = تاكسي • دي = دينه • د = دباب •
 *   ب = باص • م = ملاكي
 *
 * اللي بيتخزّن ويطلع في التصدير هو **الحرف** بس؛ الاسم بين قوسين للعرض في
 * القايمة عشان المندوب يعرف الحرف معناه إيه.
 *
 * منطق خالص (بدون JSX) عشان يتغطّى باختبارات ويُعاد استخدامه.
 */

/** الحرف → اسمه الكامل. الترتيب هنا هو ترتيب القايمة قدام المندوب. */
export const VEHICLE_TYPE_LABELS = [
  ["و", "ونيت"],
  ["ن", "نقل"],
  ["ف", "فان"],
  ["ت", "تاكسي"],
  ["دي", "دينه"],
  ["د", "دباب"],
  ["ب", "باص"],
  ["م", "ملاكي"],
] as const;

export const VEHICLE_TYPE_CODES: readonly string[] = VEHICLE_TYPE_LABELS.map(([c]) => c);

/** نص العرض في القايمة: «و (ونيت)» — الاسم مفصول عن الحرف بمسافة. */
export function vehicleTypeLabel(code: string): string {
  const hit = VEHICLE_TYPE_LABELS.find(([c]) => c === code);
  return hit ? `${hit[0]} (${hit[1]})` : code;
}

/** يحوّل قيمة نوع (حرف أو كلمة منطوقة) للحرف المختصر — عشان الصوت اللي بيسمع
 *  «ونيت/فان...» يتحوّل للحرف تلقائياً. غير المعروف → فاضي (فيفضل النص الأصلي). */
export function typeToCode(v: string): string {
  const s = String(v ?? "").trim();
  if (VEHICLE_TYPE_CODES.includes(s)) return s;
  if (/ونيت|ونت/.test(s)) return "و";
  if (/نقل/.test(s)) return "ن";
  if (/فان/.test(s)) return "ف";
  if (/تاكسي|أجرة|اجرة|اجره|أجره/.test(s)) return "ت";
  if (/دينه|دينة/.test(s)) return "دي";
  if (/دباب/.test(s)) return "د";
  if (/باص|أتوبيس|اتوبيس/.test(s)) return "ب";
  if (/ملاكي|ملاكى|خصوصي|خصوصى/.test(s)) return "م";
  return "";
}
