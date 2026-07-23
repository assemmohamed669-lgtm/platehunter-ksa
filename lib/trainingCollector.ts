/**
 * منطق قرار جمع اللوحة لداتا التدريب — دالة نقية قابلة للاختبار.
 * القاعدة (المتفق عليها مع المالك):
 *   • معدّلة يدوياً → ذهبية (أقوى ليبل).
 *   • ممسوحة → تُستبعد (المندوب مسحها = غالباً غلط).
 *   • متجاهلة/مش مُصدَّرة → تُستبعد (مش متأكدين).
 *   • مُصدَّرة (شكلها صح) → تُجمع دايماً، مع **وسم جودة** (مطابقة/ثقة عالية/عادية)
 *     — بنجمع كتير ونفلتر بالجودة offline وقت التدريب بدل ما نرمي داتا وقت الجمع.
 *   • أي شكل غلط (مش ٣ حروف + ٤ أرقام) → تُستبعد دايماً.
 */

export type CollectAction = "edited" | "exported" | "deleted" | "ignored";

export interface CollectContext {
  action: CollectAction;      // آخر فعل من المندوب على اللوحة
  uncertain: boolean;         // علامة «راجع» من المحلّل
  validShape: boolean;        // ٣ حروف صالحة + ٤ أرقام بالظبط
  listMatch: boolean;         // طابقت قائمة معروفة (مطلوبين/إحالة/سجلات)
  wordConfidenceOk: boolean;  // ثقة كل كلمات Deepgram عالية
}

export interface CollectDecision {
  collect: boolean;
  tier: "gold" | "trusted" | "skip";
  reason: string;
}

export function classifyForCollection(ctx: CollectContext): CollectDecision {
  // إشارات سلبية قاطعة أولاً.
  if (ctx.action === "deleted") return { collect: false, tier: "skip", reason: "deleted" };
  if (ctx.action === "ignored") return { collect: false, tier: "skip", reason: "not-exported" };
  if (!ctx.validShape) return { collect: false, tier: "skip", reason: "bad-shape" };

  // معدّلة يدوياً = صح مؤكّد.
  if (ctx.action === "edited") return { collect: true, tier: "gold", reason: "edited" };

  // مُصدَّرة — تُجمع (المندوب صدّرها = قبلها). بنجمع الكل ونسم الجودة عشان نفلتر
  // offline وقت التدريب، بدل ما نرمي داتا وقت الجمع. بس نستبعد المشكوك فيها شكلاً.
  if (ctx.action === "exported") {
    if (ctx.uncertain) return { collect: false, tier: "skip", reason: "uncertain" };
    const reason = ctx.listMatch ? "export-matched" : ctx.wordConfidenceOk ? "export-highconf" : "export-weak";
    return { collect: true, tier: "trusted", reason };
  }

  return { collect: false, tier: "skip", reason: "unknown" };
}
