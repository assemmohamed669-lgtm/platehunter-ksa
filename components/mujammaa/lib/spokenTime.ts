/**
 * ==========================================================================
 *  لحظة نطق اللوحة — **مطلقة ونسبية معاً**
 * ==========================================================================
 *
 *  في المجمّع كل لوحة محتاجة وقتها مرتين، بوحدتين مختلفتين:
 *
 *   · **مطلق** (epoch) لـ`GpsTrack.pinAt()` — المسار مسجّل بتوقيت الجهاز.
 *   · **نسبي** (من بداية التسجيل) لـ`SessionStamp.at()` — إدخالات الشارع
 *     والملاحظة والنوع مسجّلة بالوقت النسبي (`StampEdit.tMs`).
 *
 *  🔴 **والاتنين كانوا بيتبادلوا بالغلط.** الصفحة كانت بتبعت المطلق
 *  للختم كمان، فطلعت غلطتين مختلفتين:
 *    · «المقاطع»: epoch ضخم ⇒ الختم بيرجّع **آخر** إدخال دايماً، فالشارع
 *      اللي اتكتب في آخر الجولة بيتحطّ على أول لوحة فيها.
 *    · «كامل ⚡»: مافيش وقت أصلاً ⇒ صفر ⇒ **الحي بيطلع فاضي على كل لوحة**.
 *
 *  ⇒ الحساب بقى في **دالة واحدة** بترجّع الاتنين بأسماء واضحة، فمستحيل
 *    حد يبعت الوحدة الغلط. و`known` بتقول صريح «مافيش وقت موثوق» بدل
 *    ما الصفحة تحزر بـ`Date.now()` — ده وقت **التفريغ** مش وقت النطق،
 *    والفرق بينهم دقايق والمندوب ماشي.
 */

import { audioToWallMs, type RecPause } from "./recPauses";

/** ٢٤ ساعة بالمللي — أي وقت «نسبي» أكبر من كده هو epoch اتسرّب. */
export const DAY_MS = 86_400_000;

export interface SpokenTimeInput {
  /** لحظة اللوحة جوّه الصوت بالثواني — `undefined` = مالهاش وقت */
  timeStartS: number | undefined;
  /** لحظة بدء التسجيل (epoch) */
  baseMs: number;
  /** لحظة آخر لوحة عرفنا وقتها (epoch) — احتياطي يحافظ على الترتيب */
  lastKnownAbsMs: number;
  /**
   * ⏸️ وقفات التسجيل (٢٢ أكتوبر ٢٠٢٦ — `recPauses.ts`): الصوت مافيهوش الوقفة، فثانية اللوحة فيه بترجع لوقت
   * نطقها الحقيقي قبل ما المطلق والنسبي يتحسبوا. فاضية/مش موجودة ⇒ زي الأول بالظبط.
   */
  pauses?: readonly RecPause[] | null;
}

export interface SpokenTime {
  /** epoch — لـ`pinAt()` */
  absMs: number;
  /** من بداية التسجيل — لـ`SessionStamp.at()` */
  relMs: number;
  /**
   * فيه وقت موثوق؟ `false` ⇒ **ماتحطّش دبوس**.
   * دبوس غلط أسوأ من مافيش دبوس، لأنه بيتصدّر في Excel كأنه حقيقة.
   */
  known: boolean;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function spokenTimes(input: SpokenTimeInput): SpokenTime {
  const base = num(input?.baseMs) ?? 0;
  const t = num(input?.timeStartS);
  const last = num(input?.lastKnownAbsMs) ?? 0;

  if (t !== null) {
    const relMs = Math.round(audioToWallMs(t * 1000, input.pauses));
    return { absMs: base + relMs, relMs: Math.max(0, relMs), known: true };
  }
  if (last > 0) {
    // 🔴 النسبي بيتحسب من الأساس — **مش** بيتمرّر مطلق زي الأول
    return { absMs: last, relMs: Math.max(0, Math.round(last - base)), known: true };
  }
  // مافيش أي وقت: الختم بيرجع لبداية الجلسة (السياق اللي اتدخل قبل التسجيل)
  return { absMs: 0, relMs: 0, known: false };
}
