/**
 * بوابة الجودة الصوتية في العميل (منقولة من معمل الصوت). بتشوف الصوت **الخام
 * قبل التعلية** عشان تكشف السكوت الحقيقي — بنفس عتبات بوابة السيرفر بالحرف.
 * ملاحظة: دي بوابة **تحسين حمل** (تمنع إرسال السكوت)؛ السيرفر أصلاً بيرجّع فاضي
 * على السكوت (إصلاح begin_suppress)، فمش شرط للصحّة.
 */
export const TICK_MS = 20;

export const PREGATE_THRESHOLDS = {
  peakDbMin: -22,
  meanDbMin: -34,
  gateMaxRmsMin: 0.03,
} as const;

export interface ClipQuality {
  durSec: number;
  meanDb: number;
  peakDb: number;
  gateMaxRms: number;
}

export type PregateReason = "audio_ok" | "audio_peak_db_low" | "audio_mean_db_low" | "audio_rms_low";
export interface PregateDecision { accept: boolean; reason: PregateReason; }

function db(x: number): number {
  return 20 * Math.log10(Math.max(x, 1e-12));
}

/** يحسب خصايص الجودة من عيّنات ‎-1..1‎ (المقطع أقصر من ١٦ عيّنة = رفض). */
export function clipQuality(samples: Float32Array, sampleRate: number): ClipQuality {
  const n = samples.length;
  if (n < 16) return { durSec: 0, meanDb: -99, peakDb: -99, gateMaxRms: 0 };
  let sumSq = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    sumSq += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  const frame = Math.max(1, Math.round((TICK_MS / 1000) * sampleRate));
  const frames = Math.floor(n / frame);
  let maxRms = 0;
  if (frames === 0) {
    maxRms = Math.sqrt(sumSq / n + 1e-20);
  } else {
    for (let f = 0; f < frames; f++) {
      let s = 0;
      const from = f * frame;
      for (let i = from; i < from + frame; i++) s += samples[i] * samples[i];
      const rms = Math.sqrt(s / frame + 1e-20);
      if (rms > maxRms) maxRms = rms;
    }
  }
  return { durSec: n / sampleRate, meanDb: db(Math.sqrt(sumSq / n)), peakDb: db(peak), gateMaxRms: maxRms };
}

/**
 * القرار — بنفس ترتيب السيرفر: القمة، المتوسط، RMS. **فشل مفتوح**: أي قيمة غير
 * منتهية مابترفضش (لو حساب عندنا بايظ، الأسلم إن المقطع يسافر والسيرفر يقرّر).
 */
export function audioPregate(q: ClipQuality): PregateDecision {
  const finite = (v: number) => typeof v === "number" && Number.isFinite(v);
  if (finite(q.peakDb) && q.peakDb < PREGATE_THRESHOLDS.peakDbMin) return { accept: false, reason: "audio_peak_db_low" };
  if (finite(q.meanDb) && q.meanDb < PREGATE_THRESHOLDS.meanDbMin) return { accept: false, reason: "audio_mean_db_low" };
  if (finite(q.gateMaxRms) && q.gateMaxRms < PREGATE_THRESHOLDS.gateMaxRmsMin) return { accept: false, reason: "audio_rms_low" };
  return { accept: true, reason: "audio_ok" };
}
