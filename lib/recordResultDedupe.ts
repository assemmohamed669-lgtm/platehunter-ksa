/**
 * recordResultDedupe — اللوحة الواحدة صف واحد في نتيجة فرز **السجلات**.
 *
 * ليه: كل تشييك للوحة بيتخزّن كسجل. اللوحة اللي المندوب شيّكها تلات مرات (أو
 * شافها تلات مناديب في المجموعة) كانت بتطلع في نتيجة الفرز تلات صفوف. اللي
 * يهمّ المندوب هو **آخر مرة اتشافت وفين**، فبنسيب الأحدث ونشيل الباقي.
 *
 * (`collapseDuplicateChecks` بيدمج التشييك المتكرر في نفس الدقيقة ونفس المكان
 * وهو بيتبني — لكنه مابيلمسش تشييكات في أيام مختلفة ولا سجلات المجموعة اللي
 * جاية من السيرفر. الدمج ده بيتعمل على **النتيجة النهائية** فبيغطّي الاتنين.)
 */

import { normalizePlate, bankPlateToArabic } from "./plateParser";

/** صيغة تاريخ التشييك المعروضة: dd-MM-yyyy HH:mm */
const CHECK_DATE_RE = /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/;

/**
 * التاريخ كرقم للمقارنة. بيفهم صيغة العرض (dd-MM-yyyy HH:mm) و ISO.
 * أي حاجة تانية (أو فاضي) = صفر، فمابتتصدّرش على تاريخ حقيقي.
 */
export function checkDateValue(raw: string | null | undefined): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const m = CHECK_DATE_RE.exec(s);
  if (m) {
    const [, dd, mm, yyyy, hh = "00", mi = "00"] = m;
    const t = new Date(+yyyy, +mm - 1, +dd, +hh, +mi).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * صف واحد لكل لوحة — الأحدث. الترتيب بيفضل على أول ظهور لكل لوحة،
 * والتعادل بيكسبه الأول (سجلات المندوب بتيجي قبل سجلات المجموعة).
 * الصف اللي مالوش لوحة بيعدّي زي ما هو.
 */
export function dedupeRecordsByPlate<T>(
  rows: T[],
  plateOf: (r: T) => string,
  dateOf: (r: T) => string,
): T[] {
  const at = new Map<string, number>();   // اللوحة → مكانها في الناتج
  const out: T[] = [];
  const best: number[] = [];              // قيمة تاريخ كل صف في الناتج

  for (const r of rows) {
    const key = normalizePlate(bankPlateToArabic(String(plateOf(r) ?? "")));
    if (!key) { out.push(r); best.push(0); continue; }
    const t = checkDateValue(dateOf(r));
    const i = at.get(key);
    if (i === undefined) { at.set(key, out.length); out.push(r); best.push(t); continue; }
    if (t > best[i]) { out[i] = r; best[i] = t; }
  }
  return out;
}
