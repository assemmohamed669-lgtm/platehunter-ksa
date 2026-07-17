/**
 * المرحلة ١١أ — كاشف نمط اللوحة
 * =============================
 * بيجمّع توكنات اللوحة (حروف ثم أرقام، بترتيب ظهورها) في سلسلة لوحة واحدة
 * (حروف + أرقام) — نفس اتفاقية `normalizePlate` (ابح1234).
 *
 * ملاحظة: تقطيع **لوحات متعددة** من نفس الجملة شغل `plateContextStateMachine`
 * (المرحلة ٢) — الكاشف ده بيتعامل مع اللوحة الواحدة كحالة أساس.
 */
import { NormalizationContext, addTrace } from "./types";

export function platePatternDetector(ctx: NormalizationContext): void {
  const letters = ctx.tokens.filter((t) => t.kind === "letter").map((t) => t.text);
  const digits = ctx.tokens.filter((t) => t.kind === "digit").map((t) => t.text);
  const plate = letters.join("") + digits.join("");
  ctx.plate = plate;
  addTrace(
    ctx,
    "platePatternDetector",
    `${letters.length} حرف + ${digits.length} رقم`,
    plate,
    "تجميع اللوحة (حروف + أرقام)"
  );
}
