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
/**
 * 🔵 سياق الصوت `suspended` (أندرويد) قد كده = الميك اتاخد فعلاً — أقل من كده = **لحظة نقل المايك** (بلوتوث العربية أو
 * السماعة اتوصل). بلاغ مندوب (٢٥ أكتوبر ٢٠٢٦، فيديو): «المايك بيقفل تلقائي بعد ٣ ثواني» بـ«(السبب: الصوت اتعلّق)» من
 * غير مكالمة، وكان شغّال قبلها بساعة (٣٥١ لوحة) والبلوتوث مفتوح عنده. المحرّك بيحاول يرجّع الصوت في المهلة دي.
 * `interrupted` (الآيفون — مكالمة) زي ما هو: على طول.
 */
export const CONTEXT_SUSPEND_GRACE_MS = 2500;

export class MicLossDetector {
  private readonly rate: number;
  private zeroRun = 0;
  private mutedSince: number | null = null;
  private suspendedSince: number | null = null;
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

  /** بيتنده دورياً — الكتم أو تعليق الصوت لو طوّل. */
  tick(nowMs: number): MicLossReason | null {
    if (this.mutedSince !== null && nowMs - this.mutedSince >= MUTED_MS) return this.fire("muted");
    if (this.suspendedSince !== null && nowMs - this.suspendedSince >= CONTEXT_SUSPEND_GRACE_MS) return this.fire("interrupted");
    return null;
  }

  /**
   * `closed` = إيقاف عادي؛ `running` = شغّال (ورجع من تعليق). `interrupted` (الآيفون) = الصوت اتعلّق على طول.
   * `suspended` (أندرويد) = بيستنى `CONTEXT_SUSPEND_GRACE_MS` في `tick` — لحظة نقل المايك مابتقفلش التسجيل.
   */
  contextState(state: string, nowMs: number = Date.now()): MicLossReason | null {
    if (state === "interrupted") return this.fire("interrupted");
    if (state === "suspended") {
      if (this.suspendedSince === null) this.suspendedSince = nowMs;
      return null;
    }
    if (state === "running") this.suspendedSince = null;
    return null;
  }
}

/**
 * السبب ده يقفل التسجيل؟
 *
 * 🔴 **السكوت الرقمي لأ** — بلاغ مندوب (٢٥ سبتمبر ٢٠٢٦): «بيقول لوحات ورا
 * بعض وبعدين يسكت شوية، ويرجع يقول لوحات تاني ماياخدش معاه… بتحصل مع المندوب
 * ده بس، ومش بيبقى معاه مكالمة». موبايلات فيها كاتم ضوضاء بيطلّع **صفر بالظبط**
 * في السكوت، فسكتة ٣ ثواني كانت بتتحسب مكالمة وتقفل التسجيل — واللوحات اللي
 * بعدها ماتتسجّلش. ولو مكالمة أخدت الميك فعلاً، الأندرويد بيديها الأولوية أصلاً
 * وإحنا بنسجّل سكوت مابيتبعتش، والتسجيل بيكمّل لما تخلص. والمكالمة اللي بتفتح
 * شاشتها بيمسكها حارس الخلفية.
 */
export function stopsRecording(reason: MicLossReason): boolean {
  return reason !== "silenced";
}

/** اسم السبب في آخر الرسالة — عشان صورة شاشة المندوب تقول حصل إيه بالظبط. */
const REASON_LABEL: Record<AutoStopReason, string> = {
  background: "التطبيق راح للخلفية",
  silenced: "سكوت رقمي",
  ended: "الميك اتقفل",
  muted: "الميك اتكتم",
  interrupted: "الصوت اتعلّق",
};

/** الرسالة اللي المندوب بيشوفها لما التسجيل يقف لوحده. */
export function micLostNotice(reason: AutoStopReason): string {
  const why = reason === "background"
    ? "التطبيق راح للخلفية (مكالمة أو تطبيق تاني)"
    : "مكالمة أو تطبيق تاني أخد المايك";
  return "⏸️ التسجيل وقف لوحده — " + why + ". لوحاتك كلها محفوظة. "
    + "لما تخلص دوس «ابدأ التسجيل» تاني. (السبب: " + REASON_LABEL[reason] + ")";
}
