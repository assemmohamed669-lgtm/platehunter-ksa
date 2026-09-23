/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 إعادة إرسال النوافذ الفايتة بعد وقعة الشبكة
 * ══════════════════════════════════════════════════════════════════════
 *
 * التجربة الأخيرة قبل الفتح للمناديب (٢٣ سبتمبر ٢٠٢٦ · ٩٢/١٠٠): **٧ من
 * الـ٨ الضايعين ضاعوا في فجوة ٢٢ ثانية**. السيرفر كان سليم (كل طلب وصل
 * اتعالج في ~١٧٧ms، صفر أخطاء، صفر رست)، والوقت ضاع **بين الموبايل
 * وCloudflare**: رحلة واحدة ٧.٦ث، و٣ طلبات timeout، و١٢ نافذة «مشغول».
 *
 * 🔴 **والصوت كان لسه على الموبايل** — `micEngine` بيشيل آخر ٩٠ث. بس
 * المحرّك **ماكانش بيعيد المحاولة**: الطلب يفشل ⇒ لوحاته ضاعت للأبد.
 * (`postAudioForPlate` بيعيد مرة بس على فشل اتصال **فوري**، مش على timeout.)
 *
 * ⇒ النوافذ الفايتة بتتسجّل، وأول رد ناجح (الشبكة رجعت) بيبدأ يبعتها تاني
 *   من الذاكرة. الإجماع شغّال **بزمن الصوت** مش بزمن الوصول، فالقراية
 *   المتأخّرة بتدخل عنقودها الصح.
 */

/**
 * **٧٥ ثانية** — الذاكرة الدوّارة ٩٠ث (`LIVE_RING_SECONDS`)، و١٥ هامش عشان
 * النافذة (٥ث) + التأخير لحد ما تتبعت فعلاً. أقدم من كده الصوت مش موجود.
 */
export const REPLAY_MAX_AGE_SEC = 75;

/**
 * سقف السجل. نافذة كل ١.٥ث ⇒ ٧٥ث = ٥٠ نافذة؛ ٦٠ بهامش. في وقعة أطول
 * **الأقدم بيتشال** — كده كده صوته هيطلع برّه الذاكرة قبل ما يتبعت.
 */
export const MISSED_CAP = 60;

export interface Window { from: number; to: number; }

export class MissedWindows {
  private list: Window[] = [];

  get size(): number { return this.list.length; }

  /** سجّل نافذة فاتت (اتخطّت «مشغول» أو اتبعتت وفشلت). */
  record(from: number, to: number, nowSec: number): void {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
    this.prune(nowSec);
    // نفس النافذة مرتين (اتخطّت ثم اتبعتت وفشلت) ⇒ مرة واحدة
    if (this.list.some((w) => Math.abs(w.from - from) < 0.1 && Math.abs(w.to - to) < 0.1)) return;
    this.list.push({ from, to });
    while (this.list.length > MISSED_CAP) this.list.shift();
  }

  /** أقدم نافذة لسه صوتها في الذاكرة — وبتتشال من السجل. */
  take(nowSec: number): Window | null {
    this.prune(nowSec);
    return this.list.shift() ?? null;
  }

  private prune(nowSec: number): void {
    const oldest = nowSec - REPLAY_MAX_AGE_SEC;
    while (this.list.length && this.list[0].from < oldest) this.list.shift();
  }
}

/**
 * نبعت نافذة فايتة دلوقتي؟
 *
 * 🔴 **الإعادة مابتأخّرش اللوحات الحيّة**: بعد وقعة ٢٢ث فيه ~١٥ نافذة فايتة،
 * ولو اتبعتوا مرة واحدة كانوا هيسدّوا السلوتين ⇒ اللي المندوب بيقوله دلوقتي
 * يتأخر. فالإعادة بتاخد **سلوت واحد ساعة الفراغ** بس، وبتسيب واحد للحيّة،
 * وبتستنى أي نطق كامل مستني (أهم قراية عندنا).
 */
export function canReplay(inflight: number, maxInflight: number, pendingUtterances: number): boolean {
  if (pendingUtterances > 0) return false;
  return inflight < Math.max(1, maxInflight - 1);
}

/**
 * **٣ ثواني.** رحلات الجلسة العادية ٠.٥–٠.٩ث وأعلى واحدة عادية اتقاست ٢.٧ث،
 * والوقعة بدأت من ٣.٧ث (٣.٧ · ٥.٢ · ٧.٦ث في آخر تجربة للمالك).
 */
export const STALL_MS = 3000;

/**
 * فيه وقعة شبكة دلوقتي؟ — آخر طلب فشل، أو فيه طلب معلّق أكتر من `STALL_MS`.
 *
 * 🔴 **ليه الشرط ده**: النافذة الزاحفة بتتخطّى «مشغول» **في التشغيل العادي
 * كمان** (١٢ في آخر جلسة، كتير منهم برّه الوقعة) والنوافذ المتداخلة
 * بتغطّيها. لو اتسجّلوا كلهم كنا هنعيد إرسال نوافذ **كل جلسة** بلا أي مشكلة
 * شبكة — حمل زيادة وتغيير سلوك محدش طلبه. فالمتخطّية بتتسجّل **وقت الوقعة بس**.
 * (الطلب اللي **فشل** بيتسجّل دايماً — ده فشل حقيقي.)
 */
export function isStalled(
  lastOk: boolean,
  inflightStartsMs: readonly number[],
  nowMs: number,
  stallMs: number = STALL_MS,
): boolean {
  if (!lastOk) return true;
  return inflightStartsMs.some((t) => nowMs - t > stallMs);
}
