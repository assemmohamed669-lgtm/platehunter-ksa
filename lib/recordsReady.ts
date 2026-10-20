/**
 * ⏳ **الفرز بيستنى سجلات المندوب** — المالك (٢٠ أكتوبر ٢٠٢٦): «نتيجة فرز الداتا بيظهر معاه تمام بس نتيجة فرز السجلات
 * مش بتظهر معاه علي طول يعني لازم يفرز كذا مرة … وبيفرز وهو مش عارف ان المشكله دي موجودة».
 *
 * جدول السجلات كان بيتبني في آخر التحميل في الخلفية (بعد طلبات نت + آلاف السجلات)، والفرز بيقرا الجدول لحظة الدوسة ⇒
 * لو لسه ماخلصش، الفرز يكمّل من غير السجلات **في صمت**. صفحة الفرز بقت تحمّل السجلات من الجهاز على طول، والفرز:
 *  · `awaitRecords`: يستنى التحميل (لحد حد أقصى) ويقرا **آخر نسخة** (مش اللي كانت وقت الدوسة)؛ `late` ⇒ رسالة للمندوب.
 *  · `fillOwnName`: «المندوب» بيتملي باسمي لما الاسم يوصل من النت (التحميل بقى قبله).
 */
import { withTimeout } from "./sortRunner";

/** أقصى استنا للسجلات قبل ما الفرز يكمّل باللي موجود (التحميل من الجهاز بياخد ثواني). */
export const RECORDS_WAIT_MS = 30_000;

export async function awaitRecords<T>(
  ready: Promise<unknown> | null | undefined,
  current: () => T,
  ms: number = RECORDS_WAIT_MS,
): Promise<{ value: T; late: boolean }> {
  let late = false;
  if (ready) {
    try {
      await withTimeout(ready, ms);
    } catch (e) {
      late = (e as { name?: string })?.name === "TimeoutError";
    }
  }
  return { value: current(), late };
}

type Table = { headers: string[]; rows: Record<string, string>[] };

/** «المندوب» الفاضي ⇐ `name` (سجلات زمايل باسمهم مابتتلمسش). مفيش حاجة تتغيّر ⇒ نفس الجدول بالظبط. */
export function fillOwnName<T extends Table>(t: T, name: string): T {
  const n = String(name ?? "").trim();
  if (!n || !t.rows.some((r) => !String(r["المندوب"] ?? "").trim())) return t;
  return { ...t, rows: t.rows.map((r) => (String(r["المندوب"] ?? "").trim() ? r : { ...r, "المندوب": n })) };
}
