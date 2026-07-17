/**
 * المرحلة ١ — تنظيف اليونيكود
 * ===========================
 * منقولة سلوكياً من `plateParser.ts`: تحويل الأرقام العربية-الهندية **أولاً**
 * (لأن نطاق التشكيل بيتداخل مع كتلة الأرقام العربية-الهندية فكان هياكلها)، بعده
 * شيل التشكيل والتطويل، توحيد الألف (أ/إ/آ → ا) والياء (ى → ي)، وعلامات الترقيم
 * → مسافات، وأخيراً تجميع المسافات.
 */
import { NormalizationContext, addTrace } from "./types";
import { removeDiacritics, normalizeNumerals } from "./textUtils";

export function unicodeCleanup(ctx: NormalizationContext): void {
  const before = ctx.text;
  let t = ctx.text;
  t = normalizeNumerals(t);              // ٥→5 — قبل شيل التشكيل (تداخل النطاقات)
  t = removeDiacritics(t);               // شيل التشكيل
  t = t.replace(/ـ/g, "");               // شيل التطويل
  t = t.replace(/[أإآ]/g, "ا");          // توحيد الألف
  t = t.replace(/ى/g, "ي");              // ألف مقصورة → ياء
  t = t.replace(/[،؛؟۔.,;!?]/g, " ");    // ترقيم → مسافة
  t = t.replace(/\s+/g, " ").trim();     // تجميع المسافات
  ctx.text = t;
  addTrace(ctx, "unicodeCleanup", before, t, "تنظيف يونيكود (تشكيل/تطويل/ألف/ياء/ترقيم/أرقام)");
}
