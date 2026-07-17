/**
 * المرحلة ٦ — فك الدمج الصوتي
 * ===========================
 * بترجّع الحروف المتقطّعة اللي محرك التفريغ دمجها في كلمة عربية حقيقية
 * (حابة علامة → ح ب ل، راياء → ر ي، ياسين → ي س) عبر `PHONETIC_MERGES`.
 * القاموس مرتّب الأطول-أولاً فالعبارات الكاملة بتكسب.
 */
import { NormalizationContext, addTrace } from "./types";
import { replacePairs } from "./textUtils";
import { PHONETIC_MERGES } from "../dictionaries/mergedWords";

export function splitMergedLetters(ctx: NormalizationContext): void {
  const before = ctx.text;
  const { text, applied } = replacePairs(before, PHONETIC_MERGES);
  ctx.text = text;
  addTrace(
    ctx,
    "splitMergedLetters",
    before,
    text,
    applied.length ? `فك ${applied.length} دمج صوتي` : "لا دمج صوتي"
  );
}
