/**
 * جسر «سجلات المندوب → صفوف جدول» — عشان الفرز واللصق في صفحة المشترك
 * «صوت فقط» يعدّوا على نفس محرّك المطابقة بتاع الفرز العادي.
 *
 * ليه في ملف لوحده: ده اللي بيضمن إن الفرز بيتم على **سجلات المندوب نفسه**
 * (اللي سجّلها صوت/يدوي/كاميرا) مش على ملف التشييك ولا الإحالة. كان جوه
 * المكوّن من غير أي اختبار، فأي تعديل كان ممكن يحوّل مصدر الفرز في صمت.
 */
import type { FieldCheckEntry } from "./idb";

/** اسم عمود اللوحة اللي محرّك المطابقة بيقرا منه. */
export const REC_PLATE_COL = "رقم اللوحة";

/** يحوّل سجلات المندوب لصفوف جدول عشان تعدّي على نفس محرّك المطابقة. */
export function recordsToRows(entries: FieldCheckEntry[]): Record<string, string>[] {
  return entries.map((e) => ({
    ...e.row,                                   // الأعمدة المرجعية اللي اتحفظت مع السجل
    [REC_PLATE_COL]: e.plate,                   // لوحة السجل بتكسب أي عمود لوحة قديم جوه row
    "الطريقة": e.method ?? "",
    "التاريخ": e.checkedAt ? new Date(e.checkedAt).toLocaleString("ar-EG") : "",
    "الموقع": e.mapsLink ?? "",
  }));
}

/** صف راجع من `match_group_plates` (سجل زميل في المجموعة طابق لوحة من الفرز). */
export interface GroupPlateRow {
  plate: string | null;
  method: string | null;
  maps_link: string | null;
  checked_at: string | null;
  agent_id: string;
  extra?: Record<string, string> | null;
}

/**
 * 👥 سجلات الزمايل → نفس شكل صفوف سجلات المندوب (`recordsToRows`) + «المندوب»
 * (اسم صاحب السجل). سجلات المندوب نفسه بتتشال — موجودة أصلاً من الجهاز.
 */
export function groupRecordsToRows(
  rows: GroupPlateRow[], myId: string, names: Record<string, string>,
): Record<string, string>[] {
  return rows.filter((r) => r.agent_id !== myId).map((r) => ({
    ...(r.extra ?? {}),
    [REC_PLATE_COL]: String(r.plate ?? ""),
    "الطريقة": r.method ?? "",
    "التاريخ": r.checked_at ? new Date(r.checked_at).toLocaleString("ar-EG") : "",
    "الموقع": r.maps_link ?? "",
    "المندوب": names[r.agent_id] ?? "",
  }));
}

/**
 * 👥 **سجلات المجموعة المطابقة للوحات الفرز** — على صفحات من السيرفر
 * (`match_group_plates`، مربوطة بزرار «مشاركة السجلات»)، فـ١٠٠ ألف سجل مابينزلوش
 * على الموبايل: الراجع هو المطابق بس. أي غلط (مافيش نت…) بيرجّع اللي اتجاب لحد
 * دلوقتي — الفرز على سجلات المندوب نفسه بيكمّل عادي.
 *
 * `rpc(from, to)` = نداء الدالة بمدى الصفوف (بيتعمل في المكوّن بـsupabase).
 */
export async function fetchGroupRecordRows(
  rpc: (from: number, to: number) => PromiseLike<{ data: GroupPlateRow[] | null; error: unknown }>,
  myId: string,
  names: Record<string, string>,
  pageSize = 1000,
): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await rpc(from, from + pageSize - 1);
      if (error) return out;
      const got = data ?? [];
      out.push(...groupRecordsToRows(got, myId, names));
      if (got.length < pageSize) return out;
    }
  } catch { return out; }
}
