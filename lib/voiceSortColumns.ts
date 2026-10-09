/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎛️ أعمدة نتيجة فرز «صوت فقط» — زي صفحة الفرز بالظبط
 * ══════════════════════════════════════════════════════════════════════
 * المالك (٩ أكتوبر ٢٠٢٦): «انا عايزك تشيلها [الأعمدة] دي من عندهم وتحط نفس اللي في صفحه الفرز اللي هو خيار
 * الترتيب الاساسي للاعمده (زي البرنامج) وخيار تخصيص ... ولما يختار ويحدد التحديدة اللي هو عايزها تتحفظ حتي لو
 * خرج من البرنامج او اتنقل للصفحات».
 *
 * - **أساسي** = نفس ترتيب صفحة الفرز المتّفق عليه (`buildExportRows` / `EXPORT_COLUMNS`): كل معنى في عمود واحد
 *   («النوع» ⇐ «نوع السيارة»، «الموقع» ⇐ «GPS»، «التاريخ» ⇐ «تاريخ التسجيل»…) واللي مالوش مكان بيتلحق في الآخر.
 * - **تخصيص** = رقم اللوحة وبعده اللي المندوب اختاره **بترتيبه** (`orderedLabels`).
 * الوضع والترتيب بيتحفظوا على الجهاز بنفس مفاتيح صفحة الفرز (`lib/columnOrder.ts`).
 */
import { buildExportRows, HIDDEN_EXPORT_COLUMNS } from "./exportColumns";
import { orderedLabels, type OrderMode } from "./columnOrder";

export const VS_PLATE_COL = "رقم اللوحة";

const text = (v: unknown) => String(v ?? "").trim();
/** «الحالة» وغيره — مابيظهروش في نتيجة الفرز خالص (زي صفحة الفرز). */
const hidden = (k: string) => HIDDEN_EXPORT_COLUMNS.some((re) => re.test(k));

/**
 * جدول النتيجة بالأعمدة اللي هتظهر **وتتشارك** — `src` كل صف فيه «رقم اللوحة» + أعمدة السجل والإحالة.
 * أول عمود دايماً «رقم اللوحة».
 */
export function voiceSortTable(
  src: Record<string, unknown>[],
  mode: OrderMode,
  order: readonly string[],
): { columns: string[]; rows: Record<string, unknown>[] } {
  if (mode !== "custom") return buildExportRows(src);
  const avail: string[] = [];
  for (const r of src) {
    for (const [k, v] of Object.entries(r)) {
      if (k === VS_PLATE_COL || hidden(k) || !text(v) || avail.includes(k)) continue;
      avail.push(k);
    }
  }
  const columns = [VS_PLATE_COL, ...orderedLabels(avail, [...order])];
  return { columns, rows: src.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ""]))) };
}

/** أعمدة الاختيار في «تخصيص» مقسّمة: السجلات ثم الإحالة — من غير رقم اللوحة والفاضي ومن غير تكرار. */
export function voiceSortGroups(
  results: readonly { dataRow?: Record<string, string> | null; referralRow: Record<string, string> }[],
): { records: string[]; referral: string[] } {
  const records: string[] = [];
  const referral: string[] = [];
  const seen = new Set<string>([VS_PLATE_COL]);
  for (const m of results) {
    for (const [k, v] of Object.entries(m.dataRow ?? {})) {
      if (seen.has(k) || hidden(k) || !text(v)) continue;
      seen.add(k); records.push(k);
    }
  }
  for (const m of results) {
    for (const [k, v] of Object.entries(m.referralRow ?? {})) {
      if (seen.has(k) || hidden(k) || !text(v)) continue;
      seen.add(k); referral.push(k);
    }
  }
  return { records, referral };
}
