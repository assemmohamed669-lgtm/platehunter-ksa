/**
 * إعدادات بث Deepgram للّوحات + تحويل الصوت لـ PCM linear16 (الخطوة ٢+٣).
 *
 * ليه PCM linear16 بدل Opus/WebM: الالتقاط الحالي بيبعت Opus مضغوط بخسارة —
 * بيمسح تفاصيل الترددات العالية اللي بتفرّق الاحتكاكيات (س/ص/ش) وهي بالظبط
 * أكتر مكان بيغلط فيه التفريغ (القياس: دقة الحروف ٢٧٪ مقابل الأرقام ٥٣٪).
 * PCM بيوصل النموذج نظيف بلا ضغط.
 *
 * ليه الإعدادات دي: القياس أثبت إن Deepgram بيدعم العربي على nova-3 فقط، وإن
 * تجميع اللوحة (حروف + أرقام في نتيجة واحدة) بيتحسّن بـ endpointing أطول +
 * utterance_end_ms + vad_events بدل قطع سريع بيفتّت اللوحة.
 *
 * دوال نقية قابلة للاختبار — الوصل بالـ AudioContext في الصفحات.
 */

/** يحوّل عيّنات Float32 (‎-1..1) لـ PCM signed 16-bit (مع قصّ آمن للمدى). */
export function pcm16FromFloat32(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    // بدون Math.round — نفس اتفاقية speechmaticsRT (Int16Array بيقصّ ناحية الصفر)
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export interface DeepgramQueryOpts {
  /** معدّل عيّنات الصوت الفعلي (من AudioContext.sampleRate). */
  sampleRate: number;
  /** أسماء الحروف (keyterms) للتحيّز. اختياري. */
  keyterms?: string[];
  /** ms صمت قبل قفل الجملة — أطول = اللوحة كلها في نتيجة واحدة. افتراضي 1200. */
  endpointing?: number;
  /** ms صمت لإطلاق UtteranceEnd. افتراضي 1000. */
  utteranceEndMs?: number;
  model?: string;    // افتراضي nova-3 (الوحيد اللي بيدعم العربي)
  language?: string; // افتراضي ar
}

/**
 * يبني نص query لبث Deepgram على nova-3 بصوت PCM linear16 مونو، مضبوط لإملاء
 * اللوحات. بيرجّع string (عشان يتحط مباشرة في عنوان الـ WebSocket).
 */
export function buildDeepgramQuery(opts: DeepgramQueryOpts): string {
  const p = new URLSearchParams({
    model: opts.model ?? "nova-3",
    language: opts.language ?? "ar",
    // صوت PCM خام — لازم نصرّح بالترميز والمعدّل والقنوات (مفيش حاوية يكتشفها).
    encoding: "linear16",
    sample_rate: String(Math.round(opts.sampleRate)),
    channels: "1",
    // تجميع اللوحة: صمت أطول قبل القفل + حدث نهاية النطقة + أحداث VAD.
    interim_results: "true",           // مطلوب مع utterance_end_ms
    endpointing: String(opts.endpointing ?? 1200),
    utterance_end_ms: String(opts.utteranceEndMs ?? 1000),
    vad_events: "true",
    // بلا ترقيم/تنسيق ذكي — بيفسد شكل اللوحة.
    smart_format: "false",
    punctuate: "false",
    numerals: "true",
  });
  for (const t of opts.keyterms ?? []) p.append("keyterm", t);
  return p.toString();
}
