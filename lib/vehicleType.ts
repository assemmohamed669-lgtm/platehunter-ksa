/**
 * حروف نوع السيارة المختصرة (المندوب بيعرفها):
 *   و = ونيت • ف = فان • ت = تاكسي • م = ملاكي • دي • د
 * منطق خالص (بدون JSX) عشان يتغطّى باختبارات ويُعاد استخدامه.
 */

export const VEHICLE_TYPE_CODES = ["و", "ف", "ت", "م", "دي", "د"] as const;

/** يحوّل قيمة نوع (حرف أو كلمة منطوقة) للحرف المختصر — عشان الصوت اللي بيسمع
 *  «ونيت/فان...» يتحوّل للحرف تلقائياً. غير المعروف → فاضي (فيفضل النص الأصلي). */
export function typeToCode(v: string): string {
  const s = String(v ?? "").trim();
  if ((VEHICLE_TYPE_CODES as readonly string[]).includes(s)) return s;
  if (/ونيت|ونت/.test(s)) return "و";
  if (/فان/.test(s)) return "ف";
  if (/تاكسي|أجرة|اجرة|اجره|أجره/.test(s)) return "ت";
  if (/ملاكي|ملاكى|خصوصي|خصوصى/.test(s)) return "م";
  return "";
}
