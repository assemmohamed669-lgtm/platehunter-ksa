/**
 * المرحلة ٣ — التصحيحات المتعلّمة
 * ===============================
 * بتطبّق خريطة تصحيحات محقونة (`ctx.corrections`، heard → replacement) قبل
 * قواميس الأرقام والحروف، فتصحيح المندوب المتعلّم يكسب على القاموس العام.
 *
 * فاضية افتراضياً (passthrough). المصدر الحقيقي (`plateCorrectionsSync`) بيتوصّل
 * وقت التشغيل في خطوة ٤/المرحلة ٢ — الوحدة دلوقتي بتحقن اللي يتبعتلها بس.
 */
import { NormalizationContext, addTrace } from "./types";
import { replacePairs } from "./textUtils";

export function learnedCorrections(ctx: NormalizationContext): void {
  const entries = Object.entries(ctx.corrections) as [string, string][];
  if (entries.length === 0) {
    addTrace(ctx, "learnedCorrections", ctx.text, ctx.text, "لا تصحيحات محقونة — passthrough");
    return;
  }
  // الأطول-أولاً عشان التصحيح الأكثر تحديداً يكسب.
  const pairs = entries.sort((a, b) => b[0].length - a[0].length);
  const before = ctx.text;
  const { text, applied } = replacePairs(before, pairs);
  ctx.text = text;
  addTrace(
    ctx,
    "learnedCorrections",
    before,
    text,
    applied.length ? `تطبيق ${applied.length} تصحيح متعلّم` : "لا تطابق تصحيحات"
  );
}
