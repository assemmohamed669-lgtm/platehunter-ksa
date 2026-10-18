/**
 * قوائم شيت السجلات وعدّاداتها — **مصدر واحد للاتنين**.
 *
 * 🐞 المشكلة اللي اتعملت عشانها: المندوب شاف «مطلوب ٥» ولما داس لقى ٤ لوحات.
 * السبب إن العدّاد كان بيحسب من السجلات **الخام** والقائمة بتعرض من السجلات
 * **بعد دمج المكرر** — مصدرين مختلفين، فالرقمين اختلفوا. أي إصلاح يسيبهم
 * منفصلين هيرجّع نفس البق بشكل تاني، عشان كده الاتنين هنا في ملف واحد.
 *
 * **قرار المالك:** في «المطلوب» بالذات يتعرض **كل** سجل حتى لو مكرّر — دي
 * القائمة الحرجة، والأمان فيها إن المندوب يشوف أكتر مش أقل. وباقي القوايم
 * (الكل/صوتي/يدوي) بتفضل بتدمج المكرر، وإلا بيرجع ضجيج «نفس اللوحة ٨ مرات
 * في ٧٦ ثانية» اللي الدمج اتعمل عشانه أصلاً.
 */
import { collapseDuplicateChecks } from "./fieldCheck";
import type { FieldCheckEntry } from "./idb";

export type FieldFilter = "all" | "voice" | "manual" | "wanted";

const isVoice = (e: FieldCheckEntry) => /صوت/.test(e.method);
const isManual = (e: FieldCheckEntry) => /يدوي/.test(e.method);

/**
 * هل القائمة دي بتدمج المكرر؟ «المطلوب» لأ — بقرار المالك.
 * الدالة دي هي **المكان الوحيد** اللي القرار ده متكتوب فيه.
 */
export function collapsesDuplicates(filter: FieldFilter): boolean {
  return filter !== "wanted";
}

/** عدّادات الشرائح. «مطلوب» بيتعد خام عشان يطابق قائمته بالظبط. */
export function fieldCategoryCounts(
  entries: FieldCheckEntry[],
  isWanted: (e: FieldCheckEntry) => boolean,
): { voice: number; manual: number; wanted: number } {
  const merged = collapseDuplicateChecks(entries);
  return {
    voice: merged.filter(isVoice).length,
    manual: merged.filter(isManual).length,
    wanted: entries.filter(isWanted).length,     // خام — زي قائمته
  };
}

/** قائمة الشريحة المطلوبة، بنفس قاعدة الدمج بتاعة عدّادها. */
export function fieldCategoryList(
  entries: FieldCheckEntry[],
  filter: FieldFilter,
  isWanted: (e: FieldCheckEntry) => boolean,
): FieldCheckEntry[] {
  const base = collapsesDuplicates(filter) ? collapseDuplicateChecks(entries) : entries;
  if (filter === "voice") return base.filter(isVoice);
  if (filter === "manual") return base.filter(isManual);
  if (filter === "wanted") return base.filter(isWanted);
  return base;
}

/**
 * شريحة السجلات **بلا دمج** — لنافذة «إظهار وتعديل اللوحات».
 *
 * 🐞 المحرّر كان بيفتح **كل** السجلات مهما كانت الشريحة المختارة: المندوب واقف
 * على «مطلوب ٥» ويدوس، فيلاقي قدامه الـ١٦ ألف كلهم.
 *
 * ⚠️ وبيفلتر بس **من غير دمج المكرر** عن قصد: المحرّر بيتعدّل فيه، فلو خبّينا
 * صف مكرّر المندوب هيعدّل واحد ويسيب أخوه من غير ما يعرف. الدمج للعرض المختصر
 * بس. (والنسخة الكاملة بتفضل زي ما هي عشان الحفظ يشتغل صح.)
 */
export function fieldCategoryOnly(
  entries: FieldCheckEntry[],
  filter: FieldFilter,
  isWanted: (e: FieldCheckEntry) => boolean,
): FieldCheckEntry[] {
  if (filter === "voice") return entries.filter(isVoice);
  if (filter === "manual") return entries.filter(isManual);
  if (filter === "wanted") return entries.filter(isWanted);
  return entries;
}

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🏘️ «الحي - الشارع» — اسمين لنفس الحاجة
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (٣٠ سبتمبر ٢٠٢٦): المندوب شايف الحي والشارع قدام كل لوحة وهو
 * بيشيّك في صفحة «الجديد»، وأول ما يصدّر للسجلات بيختفي — لا في الجدول ولا في
 * ملف الإكسيل.
 *
 * السبب إن الاسمين اتكتبوا في مكانين مختلفين:
 *   • صفحة التشييك بتكتبه تحت  «الحي-الشارع»      (`AREA_COLUMN` هنا)
 *   • صفحة «الجديد» بتكتبه تحت «اسم الحي - الشارع» (`AREA_KEY` في trialRecords)
 *
 * القيمة كانت **موجودة** في السجل، بس اللي بيقرا بيدوّر عليها بالاسم التاني.
 * القراية دي بتفهم الاتنين، فالسجلات القديمة بتبان من غير أي ترحيل للداتا.
 *
 * ⚠️ أي مكان جديد يعرض أو يصدّر الحي لازم يعدّي من هنا — مايقراش المفتاح بإيده.
 */

/** الاسم الأساسي (صفحة التشييك). */
export const AREA_COLUMN = "الحي-الشارع";

/** الاسم اللي صفحة «الجديد» بتكتب بيه — مكرر هنا عشان مانجيبش دورة استيراد. */
const AREA_COLUMN_ALT = "اسم الحي - الشارع";

/** الحي والشارع من صف السجل، بأي اسم من الاتنين. "" لو مفيش. */
export function areaOf(row?: Record<string, unknown> | null): string {
  if (!row) return "";
  const primary = String(row[AREA_COLUMN] ?? "").trim();
  if (primary) return primary;
  return String(row[AREA_COLUMN_ALT] ?? "").trim();
}
