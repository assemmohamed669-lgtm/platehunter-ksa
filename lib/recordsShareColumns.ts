/**
 * ══════════════════════════════════════════════════════════════════════
 *  📤 شيت «سجل التشييك» / «داتا التسجيلات» — كل بيانات المندوب (المالك ٢٤ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «لما يشارك داتا السجلات الشيت مش بيبقي فيه اسم الشارع اللي هو كان كاتبه وقت ما كان بيسجل … يقدر يشارك سجل التشييك
 * لوحده ويبقي فيه كل البيانات اللي هو دخلها سواء ب ايده او عدل عليها او اتاخدت من الجي بي اس … وايضا يقدر يشارك داتا
 * التسجيلات لوحدها ويبقي فيها كل البيانات لكل سيارة».
 *
 * شيت صفحة السجلات (`buildFieldRows`) بيبني أعمدة ثابتة + أعمدة ملف التشييك اللي المندوب **مختارها**. الأعمدة اللي البرنامج
 * بيكتبها في السجل نفسه ماكانتش منها:
 *  · «اسم الشارع» — المجمّع (`mujammaaRecordOf`) + مربع الشارع في التشييك (`withStreetName`)
 *  · «اسم المسجّل» — Voice PRO + المجمّع (كان في «داتا التسجيلات» بس)
 *  · بيانات العربية من Voice PRO (`buildTrialFieldRow`): نوع السيارة · الشركة · رقم الهيكل · الشهادة · مطلوبة
 *  · المجمّع: دقة الموقع
 * ⇒ بتتضاف لو فيه سجل واحد على الأقل بقيمة (العمود الفاضي مايطلعش). أعمدة ملف البنك اللي المندوب ماختارهاش **مابتطلعش**
 *   (اختياره بيفضل). «شيت السجلات» في الفرز (الاتنين مع بعض) بياخد كل المفاتيح أصلاً — مااتلمسش.
 */
import { areaOf } from "./fieldCheckView";
import { isMujammaaRecord, mujammaaDistrictOf } from "./mujammaaRecords";
import { STREET_KEY } from "./streetName";

/** بالترتيب — «اسم الشارع» الأول عشان يبقى جنب الحي. */
export const OWN_RECORD_KEYS: readonly string[] = [
  STREET_KEY,
  "اسم المسجّل",
  "نوع السيارة",
  "الشركة",
  "رقم الهيكل",
  "الشهادة",
  "مطلوبة",
  "دقة الموقع (م)",
];

type Rec = { id?: string | null; row?: Record<string, unknown> | null };

/** أعمدة المندوب/البرنامج اللي ليها قيمة في سجل واحد على الأقل — ومش موجودة في أعمدة الملف المختارة. */
export function ownRecordColumns(entries: readonly Rec[], selectedCols: readonly string[]): string[] {
  const taken = new Set(selectedCols);
  return OWN_RECORD_KEYS.filter((k) => !taken.has(k) && entries.some((e) => String(e.row?.[k] ?? "").trim() !== ""));
}

/** الحي لكل سجل من مصدره — المجمّع «اسم الحي» · Voice PRO/التشييك `areaOf` (نفس `recordAreaRow`). */
export function recordDistrictOf(e: Rec): string {
  return (isMujammaaRecord(e) ? mujammaaDistrictOf(e.row) : areaOf(e.row)).trim();
}
