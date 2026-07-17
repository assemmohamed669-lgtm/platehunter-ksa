/**
 * أساس محرّك تطبيع الكلام — السياق + التتبّع + سجلّ الإسقاط
 * ========================================================
 * كل وحدات الـ pipeline بتشتغل على `NormalizationContext` مشترك بتمرّره بينها.
 *
 * مبدأ «ممنوع الإسقاط الصامت» (No Silent Drops) مطبّق في التصميم نفسه:
 *  - أي تحويل بيتسجّل عبر `addTrace`.
 *  - أي توكن **بيسقط** (كان المفروض جزء من اللوحة لكن اترفض) لازم يعدّي على
 *    `dropToken` اللي بيسجّله في `dropped` **و** في `trace` بالسبب — مفيش طريقة
 *    يختفي توكن بصمت من غير ما يظهر في السجلّين.
 *
 * ملاحظة: الوحدات دي **مستقلة** ولسه مش متوصّلة بـ `plateParser.ts` — التوصيل
 * الفعلي شغل خطوة ٤ (بإذن منفصل).
 */

export type Confidence = "high" | "medium" | "low";

export type TokenKind = "letter" | "digit" | "vehicle" | "note" | "unknown";

export interface Token {
  text: string;
  kind: TokenKind;
  confidence: Confidence;
  /** مصدر التصنيف (أي وحدة/قاموس حسمته) — للتتبّع. */
  origin: string;
}

export interface TraceEntry {
  stage: string;
  before: string;
  after: string;
  reason: string;
  confidence?: Confidence;
}

export interface DroppedToken {
  text: string;
  stage: string;
  reason: string;
}

export interface NormalizationContext {
  /** النص الأصلي زي ما وصل من المحرك. */
  original: string;
  /** النص الشغّال — بتعدّله المراحل النصية الأولى. */
  text: string;
  /** التوكنات المصنّفة — بتتملّى بعد مرحلة التقطيع. */
  tokens: Token[];
  /** ملاحظات اتوجّهت لخانتها (اتجاهات/أماكن…). */
  notes: string[];
  /** أنواع مركبات اتسحبت لخانتها. */
  vehicleTypes: string[];
  /** سجلّ كل خطوة تحويل. */
  trace: TraceEntry[];
  /** سجلّ الإسقاط — كل توكن سقط + سببه (لا إسقاط صامت). */
  dropped: DroppedToken[];
  /** تصحيحات متعلّمة محقونة (فاضية افتراضياً) — heard → canonical. */
  corrections: Record<string, string>;
  /** اللوحة المجمّعة (حروف + أرقام) — بيملّاها platePatternDetector. */
  plate?: string;
  /** محتاجة مراجعة (مش بصيغة لوحة سليمة) — بيحسبها المحقّق. */
  needsReview?: boolean;
  /** ثقة اللوحة الكلية — بيحسبها confidenceScore. */
  confidence?: Confidence;
}

export function createContext(
  original: string,
  corrections: Record<string, string> = {}
): NormalizationContext {
  return {
    original,
    text: original,
    tokens: [],
    notes: [],
    vehicleTypes: [],
    trace: [],
    dropped: [],
    corrections,
  };
}

/** بيسجّل خطوة تحويل في الـ trace. */
export function addTrace(
  ctx: NormalizationContext,
  stage: string,
  before: string,
  after: string,
  reason: string,
  confidence?: Confidence
): void {
  ctx.trace.push({ stage, before, after, reason, confidence });
}

/**
 * بيسجّل توكن **ساقط** — في `dropped` وفي `trace` معاً.
 * ده الطريق **الوحيد** المسموح بيه لإسقاط توكن (No Silent Drops).
 */
export function dropToken(
  ctx: NormalizationContext,
  text: string,
  stage: string,
  reason: string
): void {
  ctx.dropped.push({ text, stage, reason });
  ctx.trace.push({
    stage,
    before: text,
    after: "",
    reason: `[إسقاط] ${reason}`,
    confidence: "low",
  });
}
