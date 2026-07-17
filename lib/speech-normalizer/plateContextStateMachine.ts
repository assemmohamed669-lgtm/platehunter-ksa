/**
 * المرحلة ٨ — آلة حالة سياق اللوحة (stub للمرحلة ٢)
 * =================================================
 * دي الوحدة اللي هتحسم اللبس السياقي في **المرحلة ٢**:
 *  - واحد/وحده: حرف ولا الرقم ١؟ (حسب سياق حروف/أرقام).
 *  - riskyOverlaps (طه/به/يا النداء/الف=1000…) حسب موقعها.
 *  - تقطيع لوحات متعددة من نفس الجملة.
 *  - أي رقم/حرف فشل يتحوّل → يتعلّم بثقة منخفضة (No Silent Drops).
 *
 * دلوقتي **passthrough** — الذكاء ده مؤجّل صراحةً للمرحلة ٢ (مالوش مصدر
 * حتمي في السلوك الحالي)، بس الوحدة موجودة في مكانها بالـ pipeline.
 */
import { NormalizationContext, addTrace } from "./types";

export function plateContextStateMachine(ctx: NormalizationContext): void {
  addTrace(
    ctx,
    "plateContextStateMachine",
    `${ctx.tokens.length} توكن`,
    `${ctx.tokens.length} توكن`,
    "passthrough — الحسم السياقي مؤجّل للمرحلة ٢"
  );
}
