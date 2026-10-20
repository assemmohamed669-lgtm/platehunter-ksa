/**
 * ══════════════════════════════════════════════════════════════════════
 *  📍 حي المندوب في نتيجة الفرز والمشاركة — عمود واحد
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٠ أكتوبر ٢٠٢٦): بعد «املأ الحي والشارع» (`lib/areaBackfill.ts`) الحي ظهر في السجلات، «بس لما بيفرز مش
 * بيطلعو في نتيجه الفرز عايزه لما يفرز يطلعو في نتيجه الفرز وكمان لما يشارك يطلعو معاه في المشاركه».
 *
 * السبب: حي المندوب ليه ٣ أسامي حسب مصدر السجل — Voice PRO «اسم الحي - الشارع» · التشييك «الحي-الشارع» · المجمّع
 * «اسم الحي» — ونتيجة الفرز بتاخد عمود واحد لـ«العنوان»: عمود من ملف التشييك (عنوان صاحب العربية عند البنك) كان
 * بياخد مكانه، و«تخصيص» الأعمدة اتعمل قبل ما العمود يبقى موجود أصلاً.
 *
 * الحل:
 *  · `recordAreaRow`: صف السجل للفرز ⇒ حي المندوب (بأي اسم) تحت «الحي-الشارع» **بس**.
 *  · `withRecordAreaColumn`: عمود «العنوان» في نتيجة السجلات بيقرا حي المندوب **الأول** (وبعده عنوان الملف).
 *  · `addColumnOnce`: في «تخصيص» العمود بيتضاف لاختيار المندوب **مرة واحدة** — لو شاله بعدها مايرجعش.
 */
import { AREA_COLUMN, areaOf } from "./fieldCheckView";
import { AREA_KEY } from "./trialRecords";
import { isMujammaaRecord, mujammaaDistrictOf, MUJAMMAA_DISTRICT_KEY } from "./mujammaaRecords";
import { LEADING_DEFAULT_LABELS } from "./columnOrder";
import type { MergedResultColumn } from "./resultColumns";

/** اسم عمود «العنوان» في نتيجة الفرز (`RESULT_TARGETS` — key «address»). */
export const RECORD_AREA_RESULT_LABEL = "العنوان";

/**
 * صف السجل للفرز: حي المندوب تحت «الحي-الشارع» بس — «اسم الحي - الشارع» (Voice PRO) و«اسم الحي» (المجمّع)
 * بيتنقلوا ليه ويتشالوا (مايبقوش عمودين). «اسم الحي» في سجل **مش** من المجمّع = عمود من ملف البنك ⇒ مايتلمسش.
 * سجل زميل (من غير معرّف) ⇒ بالأسامي العادية (`areaOf`). الصف الأصلي مابيتغيّرش.
 */
export function recordAreaRow(e: { id?: string | null; row?: Record<string, string> | null }): Record<string, string> {
  const row: Record<string, string> = { ...(e.row ?? {}) };
  const mj = isMujammaaRecord(e);
  const area = String(mj ? mujammaaDistrictOf(row) : areaOf(row)).trim();
  delete row[AREA_KEY];
  if (mj) delete row[MUJAMMAA_DISTRICT_KEY];
  if (area) row[AREA_COLUMN] = area;
  else delete row[AREA_COLUMN];
  return row;
}

/**
 * أعمدة نتيجة السجلات: «العنوان» بيقرا «الحي-الشارع» **الأول** — لو فيه عمود عنوان من ملف التشييك بيتقري بعده،
 * ولو مفيش بيتضاف بعد «نوع السيارة». (التوائم المكررة مابتتدمجش مع حي المندوب.)
 */
export function withRecordAreaColumn(cols: readonly MergedResultColumn[]): MergedResultColumn[] {
  const out = cols.slice();
  const i = out.findIndex((c) => c.key === "address" && c.source === "data");
  if (i >= 0) {
    const c = out[i];
    const rest = c.sourceCols.filter((s) => s !== AREA_COLUMN);
    const merged: MergedResultColumn = { ...c, sourceCol: AREA_COLUMN, sourceCols: [AREA_COLUMN, ...rest] };
    delete merged.dupCols;
    out[i] = merged;
    return out;
  }
  let at = 0;
  while (at < out.length && out[at].key === "type") at++;
  out.splice(at, 0, {
    id: "tash-area", key: "address", label: RECORD_AREA_RESULT_LABEL,
    source: "data", sourceCol: AREA_COLUMN, sourceCols: [AREA_COLUMN],
  });
  return out;
}

interface FlagStore { get(k: string): string | null; set(k: string, v: string): void }
const localFlags: FlagStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* مش متاح */ } },
};

/**
 * «تخصيص»: يضيف `label` لترتيب المندوب **مرة واحدة** (بعد «نوع السيارة»). بيرجّع الترتيب الجديد، أو `null` لو
 * ماتغيّرش (اتضاف قبل كده — حتى لو المندوب شاله بعدها — أو موجود أصلاً). الترتيب الفاضي = الافتراضي.
 */
export function addColumnOnce(order: readonly string[], label: string, flagKey: string, store: FlagStore = localFlags): string[] | null {
  if (store.get(flagKey) === "1") return null;
  store.set(flagKey, "1");
  if (order.includes(label)) return null;
  const base = order.length ? order.slice() : [...LEADING_DEFAULT_LABELS];
  const t = base.indexOf("نوع السيارة");
  base.splice(t >= 0 ? t + 1 : 0, 0, label);
  return base;
}
