/**
 * المرحلة ٢ — إزالة الضوضاء (noise removal)
 * =========================================
 * ⚠️ مفهوم منفصل عن **توجيه الملاحظات** (note routing):
 *  - إزالة الضوضاء = كلام بيتشال **خالص** (نداء «يا»، حشو…) — مالوش أثر على اللوحة.
 *  - توجيه الملاحظات = كلمات ليها معنى بتروح خانة الملاحظات (اتجاهات/أماكن) —
 *    دي في `normalizeWords` عبر `NOTE_KEYWORDS`.
 *
 * القائمة دي **فاضية** عمداً: مفيش مصدر ليها في السلوك الحالي، وأي إضافة فيها
 * تعتبر **تغيير سلوك يتأجّل للمرحلة ٢**. الوحدة موجودة كمكانها في الـ pipeline
 * وجاهزة للتوسعة، لكن دلوقتي passthrough بحت.
 */
import { NormalizationContext, addTrace, dropToken } from "./types";

/** كلمات بتتشال خالص. فاضية دلوقتي (سلوك جديد مؤجّل للمرحلة ٢). */
export const NOISE_WORDS: Set<string> = new Set();

export function removeNoise(ctx: NormalizationContext): void {
  const before = ctx.text;
  if (NOISE_WORDS.size === 0) {
    addTrace(ctx, "removeNoise", before, before, "قائمة الضوضاء فاضية — passthrough (مؤجّل للمرحلة ٢)");
    return;
  }
  // مسار المرحلة ٢: أي كلمة ضوضاء تتشال لازم تعدّي على dropToken (لا إسقاط صامت).
  const kept: string[] = [];
  for (const word of before.split(/\s+/).filter(Boolean)) {
    if (NOISE_WORDS.has(word)) {
      dropToken(ctx, word, "removeNoise", "كلمة ضوضاء");
    } else {
      kept.push(word);
    }
  }
  const after = kept.join(" ");
  ctx.text = after;
  addTrace(ctx, "removeNoise", before, after, "إزالة كلمات ضوضاء");
}
