/**
 * محرّك تطبيع الكلام — المنسّق
 * ============================
 * بيشغّل وحدات الـ pipeline بالترتيب على `NormalizationContext` واحد ويرجّع
 * النتيجة النهائية + الـ trace + سجلّ الإسقاط.
 *
 * ⚠️ الوحدات دي **مستقلة ولسه مش متوصّلة بـ `plateParser.ts`** — التوصيل الفعلي
 * (خلي `parsePlateFromTranscript`/`extractMultiplePlates` ينادوا الإنجن ده)
 * شغل خطوة ٤ اللي محتاجة إذن منفصل.
 *
 * ترتيب المراحل:
 *   unicodeCleanup → removeNoise → learnedCorrections → normalizeLetters →
 *   normalizeNumbers → splitMergedLetters → normalizeWords(تقطيع+توجيه) →
 *   plateContextStateMachine → fuzzy → phonetic →
 *   platePatternDetector → validators → confidenceScore
 *
 * ملاحظات ترتيب:
 *  - `normalizeLetters` **قبل** `normalizeNumbers` (قرار معتمد): في إملاء اللوحات
 *    «الف» = الحرف ا مش العدد ١٠٠٠، زي `plateAtoms` في البارسر بالظبط (بيطبّق
 *    LETTER_NAMES قبل SPOKEN_NUMBERS). أي إعادة نظر في اللبس ده مكانها
 *    `plateContextStateMachine` في المرحلة ٢.
 *  - قفل **زير قبل SPOKEN_NUMBERS** محفوظ جوّه `normalizeNumbers` نفسها.
 *  - `splitMergedLetters` قبل `normalizeWords` لأن التقطيع لازم يشوف الحروف بعد فك الدمج.
 */
import {
  createContext,
  Confidence,
  Token,
  TraceEntry,
  DroppedToken,
} from "./types";
import { unicodeCleanup } from "./unicodeCleanup";
import { removeNoise } from "./removeNoise";
import { learnedCorrections } from "./learnedCorrections";
import { normalizeNumbers } from "./normalizeNumbers";
import { normalizeLetters } from "./normalizeLetters";
import { splitMergedLetters } from "./splitMergedLetters";
import { normalizeWords } from "./normalizeWords";
import { plateContextStateMachine } from "./plateContextStateMachine";
import { fuzzy } from "./fuzzy";
import { phonetic } from "./phonetic";
import { platePatternDetector } from "./platePatternDetector";
import { validatePlate } from "./validators";
import { confidenceScore } from "./confidenceScore";

export * from "./types";

export interface NormalizeOptions {
  /** تصحيحات متعلّمة محقونة — heard → replacement. */
  corrections?: Record<string, string>;
}

export interface NormalizeResult {
  plate: string;
  notes: string[];
  vehicleTypes: string[];
  needsReview: boolean;
  confidence: Confidence;
  tokens: Token[];
  trace: TraceEntry[];
  dropped: DroppedToken[];
}

export function normalizeTranscript(
  text: string,
  opts: NormalizeOptions = {}
): NormalizeResult {
  const ctx = createContext(text, opts.corrections ?? {});

  unicodeCleanup(ctx);
  removeNoise(ctx);
  learnedCorrections(ctx);
  normalizeLetters(ctx);
  normalizeNumbers(ctx);
  splitMergedLetters(ctx);
  normalizeWords(ctx);
  plateContextStateMachine(ctx);
  fuzzy(ctx);
  phonetic(ctx);
  platePatternDetector(ctx);
  validatePlate(ctx);
  confidenceScore(ctx);

  return {
    plate: ctx.plate ?? "",
    notes: ctx.notes,
    vehicleTypes: ctx.vehicleTypes,
    needsReview: ctx.needsReview ?? true,
    confidence: ctx.confidence ?? "low",
    tokens: ctx.tokens,
    trace: ctx.trace,
    dropped: ctx.dropped,
  };
}
