/**
 * المرحلة ٤ — تطبيع الأرقام المنطوقة
 * ==================================
 * ⚠️ قيد ترتيب رسمي (منقول من السلوك الحالي في `plateParser.ts`):
 * عائلة «زير» (`ZERO_WORD_RE`) بتتحل **قبل** قاموس الأرقام (`SPOKEN_NUMBERS`).
 * الترتيب ده مقفول باختبار صريح بيبوظ لو اتعكس.
 *
 * الأرقام مرتّبة الأطول-أولاً في القاموس نفسه، فالمركّبات (خمسة عشر) بتكسب على
 * الأحادية (خمسة).
 */
import { NormalizationContext, addTrace } from "./types";
import { replacePairs } from "./textUtils";
import { ZERO_WORD_RE } from "../dictionaries/zeroForms";
import { SPOKEN_NUMBERS } from "../dictionaries/numbers";

export function normalizeNumbers(ctx: NormalizationContext): void {
  // ── ١) zero-forms أولاً (قيد الترتيب) ──────────────────────────────────
  const beforeZero = ctx.text;
  const zeroRe = new RegExp(ZERO_WORD_RE.source, ZERO_WORD_RE.flags);
  const afterZero = beforeZero.replace(zeroRe, " 0 ").replace(/\s+/g, " ").trim();
  ctx.text = afterZero;
  addTrace(
    ctx,
    "normalizeNumbers:zeroForms",
    beforeZero,
    afterZero,
    beforeZero === afterZero ? "لا صيغ زير" : "تحويل عائلة زير → 0"
  );

  // ── ٢) قاموس الأرقام المنطوقة ──────────────────────────────────────────
  const beforeSpoken = ctx.text;
  const { text: afterSpoken, applied } = replacePairs(beforeSpoken, SPOKEN_NUMBERS);
  ctx.text = afterSpoken;
  addTrace(
    ctx,
    "normalizeNumbers:spokenNumbers",
    beforeSpoken,
    afterSpoken,
    applied.length
      ? `تحويل ${applied.length} رقم منطوق`
      : "لا أرقام منطوقة"
  );
}
