/**
 * المرحلة ١٠ — المطابقة الصوتية (stub للمرحلة ٢)
 * ==============================================
 * هتستخدم `PHONETIC_NEIGHBOR_GROUPS` (من `phoneticAliases`) لحسم الحروف اللي
 * فيها لبس صوتي (ح/ه، س/ص، ق/ك…) في **المرحلة ٢**. دلوقتي **passthrough** —
 * مطابقة الجيرة الصوتية سلوك جديد مؤجّل للمرحلة ٢.
 */
import { NormalizationContext, addTrace } from "./types";

export function phonetic(ctx: NormalizationContext): void {
  addTrace(ctx, "phonetic", `${ctx.tokens.length} توكن`, `${ctx.tokens.length} توكن`, "passthrough — المطابقة الصوتية مؤجّلة للمرحلة ٢");
}
