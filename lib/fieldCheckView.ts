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
