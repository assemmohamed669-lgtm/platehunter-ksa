/**
 * المرحلة ١٢ — حساب الثقة
 * =======================
 * بيحسب ثقة اللوحة الكلية من حالة السياق (تطبيقاً لمبدأ «ممنوع الإسقاط الصامت»
 * على مستوى المخرجات — أي شك بيطلع أحمر للمراجعة):
 *  - low   : فيه توكن ساقط، أو توكن غير معروف، أو اللوحة مش سليمة.
 *  - medium: اللوحة سليمة بس فيها تحويل غير مؤكد (تصحيح سمعي medium/low).
 *  - high  : كله مؤكد واللوحة سليمة.
 */
import { NormalizationContext, addTrace, Confidence } from "./types";

export function confidenceScore(ctx: NormalizationContext): void {
  let conf: Confidence = "high";
  const reasons: string[] = [];

  if (ctx.dropped.length > 0) {
    conf = "low";
    reasons.push(`${ctx.dropped.length} توكن ساقط`);
  }
  if (ctx.tokens.some((t) => t.kind === "unknown")) {
    conf = "low";
    reasons.push("توكن غير معروف");
  }
  if (ctx.needsReview) {
    conf = "low";
    reasons.push("لوحة مش سليمة");
  }
  if (conf === "high") {
    const uncertain = ctx.trace.some(
      (t) => t.confidence === "medium" || t.confidence === "low"
    );
    if (uncertain) {
      conf = "medium";
      reasons.push("تحويل غير مؤكد");
    }
  }

  ctx.confidence = conf;
  addTrace(
    ctx,
    "confidenceScore",
    ctx.plate ?? "",
    conf,
    reasons.length ? reasons.join("، ") : "كل التحويلات مؤكدة واللوحة سليمة",
    conf
  );
}
