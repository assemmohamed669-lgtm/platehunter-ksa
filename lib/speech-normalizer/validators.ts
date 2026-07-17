/**
 * المرحلة ١١ب — المحقّق
 * =====================
 * بيعيد استخدام `isStrictPlate` من `structuredPlates.ts` (٣ حروف صالحة + ٤
 * أرقام) — **مش** بيكرّر القاعدة. أي لوحة مش سليمة → needsReview = true.
 */
import { NormalizationContext, addTrace } from "./types";
import { isStrictPlate } from "../structuredPlates";

export function validatePlate(ctx: NormalizationContext): void {
  const plate = ctx.plate ?? "";
  const strict = isStrictPlate(plate);
  ctx.needsReview = !strict;
  addTrace(
    ctx,
    "validators",
    plate,
    strict ? "سليمة" : "محتاجة مراجعة",
    strict ? "لوحة سليمة (٣ حروف + ٤ أرقام)" : "مش بصيغة لوحة سعودية سليمة",
    strict ? "high" : "low"
  );
}
