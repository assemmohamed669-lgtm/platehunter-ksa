/**
 * ==========================================================================
 *  التنبيه الصوتي
 * ==========================================================================
 *  لما اللوحة تطابق شيت البنك المندوب لازم يعرف **بالصوت**، لأن عينه
 *  غالباً على الشارع مش على الشاشة.
 *
 *  استخدمنا WebAudio بدل ملف صوت لتلات أسباب:
 *   ١. بلا أي ملف يتحمّل — التنبيه فوري من أول مرة
 *   ٢. نقدر نعمل نغمات مختلفة نميّز بيها نوع التطابق
 *   ٣. بيشتغل من غير إنترنت
 *
 *  نوعين مختلفين بالقصد:
 *   - تطابق تام   → ٣ نغمات عالية سريعة (فرح/تأكيد)
 *   - تطابق تقريبي → ٢ نغمات واطية (تحذير: راجع بنفسك)
 */

import { stopAlertSiren as stopLegacySiren } from "./ph/alertSiren";
import { playSelectedAlert, stopActiveAlert } from "./tones";

/**
 * يوقف تنبيه اللوحة المطلوبة الشغّال (النغمة المختارة) — ودي اللي بتستخدمها
 * الصفحات لما المندوب يضغط «تم». بنوقف كمان الصفّارة القديمة احتياطاً لو
 * كانت لسه شغّالة من نسخة قديمة.
 */
export function stopAlertSiren(): void {
  stopActiveAlert();
  stopLegacySiren();
}

let audioCtx: AudioContext | null = null;

/** يجيب سياق الصوت (بيتعمل مرة واحدة) */
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/**
 * المتصفحات بتمنع الصوت قبل أول لمسة من المستخدم.
 * بننادي دي مع أول ضغطة زر عشان التنبيه يشتغل بعدها فوراً.
 */
export function unlockAudio(): void {
  const c = ctx();
  if (c && c.state === "suspended") void c.resume();
}

/** نغمة واحدة */
function beep(
  frequency: number,
  startAt: number,
  durationMs: number,
  volume = 0.28
): void {
  const c = ctx();
  if (!c) return;

  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = "sine";
  osc.frequency.value = frequency;

  const t0 = c.currentTime + startAt;
  const t1 = t0 + durationMs / 1000;

  // منحنى ناعم عشان النغمة ما تطقّش في الودن
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/** تطابق تام مع شيت البنك — ٣ نغمات عالية */
export function playExactMatchAlert(): void {
  unlockAudio();
  /**
   * 🔔 **صفّارة حرب — بطلب المالك (٢٠٢٦/٨/١٥)**
   *
   * كانت تلات نغمات قصيرة (دو-مي-صول، ~نص ثانية). والمندوب في الشارع
   * وسط عربيات وضوضاء ومعاه التليفون في جيبه — النغمة اللطيفة دي بتضيع.
   * واللوحة المطلوبة هي **كل سبب وجود البرنامج**، فتنبيهها لازم يبقى
   * مستحيل يفوت.
   *
   * الصفّارة بتفضل شغّالة لحد ما المندوب يوقّفها بإيده (‎stopAlertSiren‎) —
   * مش نغمة بتعدّي. ومكتوبة بالكامل بـWeb Audio، فبتشتغل أوفلاين وبلا
   * أي ملف صوت.
   *
   * ⚠️ وبقت للتطابق **الكامل** بس — بعد ما التقريبي اتشال خالص.
   *
   * النغمة نفسها بقت **مختارة من المندوب** (٢٠ نغمة في القائمة الجانبية)
   * — الافتراضي لسه صفّارة الحرب.
   */
  playSelectedAlert();
}

/** تطابق تقريبي — نغمتين واطيتين (راجعها بنفسك) */
export function playFuzzyMatchAlert(): void {
  unlockAudio();
  beep(660, 0, 150, 0.24);
  beep(560, 0.19, 220, 0.24);
}

/** نقرة خفيفة تتأكد إن اللوحة اتسجّلت (مش مطلوبة) */
export function playCapturedTick(): void {
  unlockAudio();
  beep(880, 0, 55, 0.12);
}

/** خطأ — نغمة واطية طويلة */
export function playErrorAlert(): void {
  unlockAudio();
  beep(220, 0, 320, 0.22);
}

/** تنبيه حسب نوع التطابق — دي اللي بتستخدمها الصفحات */
export function playMatchAlert(kind: "exact" | "fuzzy" | "none"): void {
  if (kind === "exact") return playExactMatchAlert();
  if (kind === "fuzzy") return playFuzzyMatchAlert();
  return playCapturedTick();
}

/**
 * تنبيه ملخّص لمجموعة لوحات ظهرت في نفس اللحظة (نتيجة التفريغ المجمع).
 *
 * ليه؟ لأن التفريغ بيطلّع كل اللوحات في نفس الجزء من الثانية. لو نبّهنا
 * لكل واحدة، النغمات بتتركب على بعض وتطلع «طششش» واحدة — والمندوب ما
 * يعرفش كام لوحة طلعت مطلوبة.
 *
 * فبننبّه بأقوى نوع تطابق، وبنعدّ عدد المطلوبات بنغمات متتابعة بفواصل
 * واضحة (بحد أقصى ٥ عشان ما تطولش).
 */
export function playBatchSummaryAlert(counts: {
  exact: number;
  fuzzy: number;
}): void {
  unlockAudio();

  if (counts.exact > 0) {
    const beeps = Math.min(5, counts.exact);
    for (let i = 0; i < beeps; i++) {
      const at = i * 0.34;
      beep(1046, at, 100);
      beep(1568, at + 0.12, 150);
    }
    return;
  }

  if (counts.fuzzy > 0) {
    const beeps = Math.min(5, counts.fuzzy);
    for (let i = 0; i < beeps; i++) {
      beep(660, i * 0.3, 140, 0.24);
    }
    return;
  }

  playCapturedTick();
}
