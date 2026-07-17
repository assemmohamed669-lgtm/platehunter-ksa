/**
 * المرحلة ٥ — تطبيع الحروف
 * ========================
 * مرحلتين من قاموس الحروف المشتق:
 *  ١) `LETTER_VARIANT_MAP` — أشكال نطق الحروف الرسمية → canonical (ثقة عالية).
 *  ٢) `LETTER_MISTAKE_MAP` — أخطاء سمع شائعة (خاء→ح، سعد→ص…) بثقة medium/low.
 *
 * الأطول-أولاً في كل مرحلة عشان «الحاء» تكسب على «حا».
 *
 * `riskyOverlaps` **مش بتتعامل هنا**: البذرة قرّرت تحوّل التوكنات دي كـ variants
 * افتراضياً (طه→ط، به→ب…)، والحسم السياقي لو غلط شغل `plateContextStateMachine`
 * في المرحلة ٢ — مش استبدال أعمى إضافي في المرحلة دي.
 */
import { NormalizationContext, addTrace } from "./types";
import { replacePairs } from "./textUtils";
import { LETTER_VARIANT_MAP } from "../dictionaries/letters";
import { LETTER_MISTAKE_MAP } from "../dictionaries/commonMistakes";

const VARIANT_PAIRS: [string, string][] = (
  Object.entries(LETTER_VARIANT_MAP) as [string, string][]
).sort((a, b) => b[0].length - a[0].length);

export function normalizeLetters(ctx: NormalizationContext): void {
  // ── ١) أشكال النطق الرسمية (ثقة عالية) ──────────────────────────────────
  const before = ctx.text;
  const { text: afterV, applied: appliedV } = replacePairs(before, VARIANT_PAIRS);
  ctx.text = afterV;
  addTrace(
    ctx,
    "normalizeLetters:variants",
    before,
    afterV,
    appliedV.length ? `تحويل ${appliedV.length} اسم حرف` : "لا أسماء حروف",
    "high"
  );

  // ── ٢) أخطاء السمع الشائعة (medium/low لكل واحدة) ───────────────────────
  let t = ctx.text;
  const heardKeys = Object.keys(LETTER_MISTAKE_MAP).sort((a, b) => b.length - a.length);
  for (const heard of heardKeys) {
    const { canonical, confidence } = LETTER_MISTAKE_MAP[heard];
    const { text: nt, applied } = replacePairs(t, [[heard, canonical]]);
    if (applied.length) {
      addTrace(
        ctx,
        "normalizeLetters:mistakes",
        t,
        nt,
        `تصحيح سمعي «${heard}» → ${canonical}`,
        confidence
      );
      t = nt;
    }
  }
  ctx.text = t;
}
