/**
 * ══════════════════════════════════════════════════════════════════════
 *  الميك راح؟ — المكالمة ليها الأولوية، والتسجيل بيقف لوحده
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «مش عايز لو جه مكالمة والمندوب بيسجّل تتعارض
 * مع المايك — وتقفل المايك للمكالمة، المكالمة يبقى ليها الأولوية. وتلقائي
 * المسجّل يفصل لو جه مكالمة، سواء مكالمة تليفون أو على أي تطبيق تواصل».
 *
 * الويب مايقدرش يسأل «فيه مكالمة؟» — بس يقدر يعرف إن **الميك اتاخد**:
 *
 *  · 🔴 **أصفار رقمية بالظبط** — أندرويد ١٠+ لما مكالمة (تليفون أو واتساب)
 *    تاخد الميك، التطبيق التاني بيفضل «شغّال» بس بيوصله **صفر**. ده مش
 *    سكوت عادي: أهدى شارع فيه ضوضاء صغيرة عمرها ما بتبقى صفر بالظبط.
 *  · التراك اتقفل (`ended`) — الميك اتسحب خالص.
 *  · التراك اتكتم (`mute`) لفترة — مش لحظة.
 *  · سياق الصوت اتعلّق (`interrupted` على الآيفون، أو `suspended`) — المكالمة
 *    على الآيفون بتعمل كده.
 *
 * والرجوع للخلفية (المندوب فتح المكالمة أو بدّل تطبيق) بتتعامل معاه الصفحة
 * نفسها بـ`visibilitychange` — نفس حارس «صوتي» بالظبط.
 *
 * ⚠️ الكاشف **بيبلّغ مرة واحدة** — أول سبب بيوقف التسجيل، والباقي مالوش لازمة.
 */

export type MicLossReason = "silenced" | "ended" | "muted" | "interrupted";
/** كل أسباب الوقف التلقائي — الخلفية بتتكشف في الصفحة. */
export type AutoStopReason = MicLossReason | "background";

/** أصفار رقمية متصلة قد كده = الميك اتاخد. بداية الميك ممكن تبدأ بأصفار أقل من ثانية. */
export const SILENCED_MS = 3000;
/** كتم التراك قد كده = مش لحظة عابرة. */
export const MUTED_MS = 1500;

export class MicLossDetector {
  private readonly rate: number;
  private zeroRun = 0;
  private mutedSince: number | null = null;
  private fired = false;

  constructor(sampleRate: number) {
    this.rate = sampleRate > 0 ? sampleRate : 16000;
  }

  private fire(r: MicLossReason): MicLossReason | null {
    if (this.fired) return null;
    this.fired = true;
    return r;
  }

  /** عيّنات الميك الخام — أي عيّنة مش صفر بالظبط بتصفّر العدّاد. */
  feed(chunk: Float32Array): MicLossReason | null {
    if (this.fired) return null;
    let lastNonZero = -1;
    for (let i = chunk.length - 1; i >= 0; i--) {
      if (chunk[i] !== 0) { lastNonZero = i; break; }
    }
    if (lastNonZero === -1) this.zeroRun += chunk.length;
    else this.zeroRun = chunk.length - 1 - lastNonZero;
    return (this.zeroRun * 1000) / this.rate >= SILENCED_MS ? this.fire("silenced") : null;
  }

  trackEnded(): MicLossReason | null { return this.fire("ended"); }

  trackMuted(nowMs: number): void {
    if (this.mutedSince === null) this.mutedSince = nowMs;
  }

  trackUnmuted(): void { this.mutedSince = null; }

  /** بيتنده دورياً — الكتم لو طوّل. */
  tick(nowMs: number): MicLossReason | null {
    if (this.mutedSince === null) return null;
    return nowMs - this.mutedSince >= MUTED_MS ? this.fire("muted") : null;
  }

  /** `closed` = إيقاف عادي؛ `running` = شغّال. الباقي = الصوت اتعلّق. */
  contextState(state: string): MicLossReason | null {
    if (state === "interrupted" || state === "suspended") return this.fire("interrupted");
    return null;
  }
}

/** الرسالة اللي المندوب بيشوفها لما التسجيل يقف لوحده. */
export function micLostNotice(reason: AutoStopReason): string {
  const why = reason === "background"
    ? "التطبيق راح للخلفية (مكالمة أو تطبيق تاني)"
    : "مكالمة أو تطبيق تاني أخد المايك";
  return "⏸️ التسجيل وقف لوحده — " + why + ". لوحاتك كلها محفوظة. "
    + "لما تخلص دوس «ابدأ التسجيل» تاني.";
}
