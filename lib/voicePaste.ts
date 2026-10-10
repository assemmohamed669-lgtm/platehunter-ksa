/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎨 «لصق نصي» في فرز «صوت فقط» — كل مرة اتسجلت فيها اللوحة
 * ══════════════════════════════════════════════════════════════════════
 * المالك (١١ أكتوبر ٢٠٢٦): «لما المندوب بيعمل لصق نصي وعندو سيارات مكررة في السجلات او في الداتا مش بيطلعلو غير
 * سيارة واحده ... لو حبك1234 مكررة 3 مرات تطلع ال 3 مرات ويتلونو بنفس اللون».
 *
 * اللصق كان بيتطابق على `buildReferralIndex` (صف **واحد** لكل لوحة) ⇒ دلوقتي `matchTokensAgainstRows` اللي بيرجّع
 * **كل** التطابقات التامة — نفس اللي صفحة الفرز بتعمله في اللصق من #395. نفس اللوحة بتطلع تحت بعض بترتيب اللصق.
 */
import { matchTokensAgainstRows, normalizePlate, bankPlateToArabic, type MatchResult } from "./plateParser";
import { REC_PLATE_COL } from "./voiceOnlyRecords";

const norm = (p: string) => normalizePlate(bankPlateToArabic(String(p ?? "")));

/**
 * اللوحات الملصوقة على صفوف السجلات (وداتا المجموعة) — **تام بس** زي قبل. شكل النتيجة زي الأول: السجل في
 * `referralRow` واللوحة زي ما المندوب لصقها في `dataRow`. نفس اللوحة ملصوقة مرتين بتتحسب مرة.
 */
export function matchPastedOnRecords(tokens: string[], rows: Record<string, string>[]): MatchResult[] {
  const pasted = new Map<string, Record<string, string>>();
  for (const t of tokens) {
    const k = norm(t);
    if (k && !pasted.has(k)) pasted.set(k, { [REC_PLATE_COL]: t });
  }
  return matchTokensAgainstRows([...pasted.values()].map((r) => r[REC_PLATE_COL]), rows, REC_PLATE_COL, 88, false)
    .map((m) => ({ referralRow: m.row, dataRow: pasted.get(norm(m.converted)), status: "exact" as const }));
}

/** ألوان المكرر — نفس ألوان جدول اللصق في صفحة الفرز. */
export const VS_DUP_COLORS = [
  "bg-yellow-100", "bg-blue-100", "bg-green-100", "bg-purple-100",
  "bg-orange-100", "bg-pink-100", "bg-teal-100", "bg-red-100",
] as const;

/** لون كل صف (رقم في `VS_DUP_COLORS`): اللوحة اللي طلعت أكتر من مرة كل مراتها بلون واحد، والباقي من غير لون. */
export function pasteDupColors(plates: string[]): (number | undefined)[] {
  const keys = plates.map(norm);
  const counts = new Map<string, number>();
  for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  const color = new Map<string, number>();
  for (const [k, n] of counts) if (n > 1) color.set(k, color.size % VS_DUP_COLORS.length);
  return keys.map((k) => color.get(k));
}
