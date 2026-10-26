/**
 * 📤 «مشاركة اللوحات الجديدة» في «فرز جديد» (٢٦ أكتوبر ٢٠٢٦).
 *
 * المالك: «لما المندوب يختار فرز جديد يظهر تحت شيت الاحاله علامه مشاركه صغيرة ولما المندوب يدوس عليها يجيلو رساله
 * مفادها ان البرنامج هيشارك لوحات السيارات الجديدة في شيت اكسيل ولما يختارها يشارك الملف اكسيل وفيه لوحات السيارات
 * الجديدة في الشيت بكل بياناتها اللي نازله في المحفظه».
 *
 * «الجديد» = **نفس حساب «فرز جديد» بالحرف** (`runNewSort`): كل شيتات الإحالة مدموجة ومزالة التكرار (أول ظهور يكسب —
 * `collectReferralEntries`) ناقص اللي في ملفات التشييك (`splitReferralByCheck`) ⇒ العدد بيطابق «X من Y في التشييك».
 * الصف بيطلع بكل أعمدة المحفظة زي ما هو (نسخة — الإكسيل مابيلمسش بيانات الصفحة).
 */
import { collectReferralEntries, type ReferralSource } from "./plateParser";
import { splitReferralByCheck } from "./newSortCheck";

export function newPlatesFromReferral(sources: ReferralSource[], checkSet: Set<string>): Record<string, string>[] {
  return splitReferralByCheck(collectReferralEntries(sources), checkSet).fresh.map((e) => ({ ...e.row }));
}

/** الرسالة اللي بتطلع قبل المشاركة. */
export function newPlatesConfirmText(count: number): string {
  return `البرنامج هيشارك لوحات السيارات الجديدة (${count.toLocaleString("ar-EG")} لوحة) في ملف إكسيل بكل بياناتها اللي في المحفظة. تكمّل؟`;
}

/** اسم الملف من غير الامتداد: «لوحات-جديدة-2026-10-26». */
export function newPlatesFileBase(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `لوحات-جديدة-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 📁 اسم الملف المتشارك = **نفس اسم ملف الإحالة المرفوع** (المالك: «يتشارك بنفس اسم الملف المرفوع») بامتداد الملف
 * الجديد (xlsx أو csv الاحتياطي). من غير اسم ⇒ «لوحات-جديدة-التاريخ».
 */
export function newPlatesShareName(uploadedName: string | null | undefined, ext: string, now: Date): string {
  const name = (uploadedName ?? "").trim();
  const base = name.replace(/.[^.]+$/, "").trim();
  return `${base || newPlatesFileBase(now)}.${ext}`;
}
