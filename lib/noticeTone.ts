/**
 * noticeTone — نغمة تحذيرية قصيرة للرسالة العاجلة من الأدمن.
 *
 * **مش صفّارة ولا رنّة** — دول بيضايقوا المندوب وهو شغّال. دي نغمة إشعار
 * عادية: نغمتين ناعمتين صاعدتين (زي «دِنج» الرسايل) وتسكت لوحدها في أقل من
 * نص ثانية. البانر الأحمر بيفضل ظاهر لحد ما المندوب يقفله — التنبيه بالصوت
 * مرة واحدة بس.
 *
 * **ليه منفصلة عن `alertSiren`:** صفّارة السيارة المطلوبة singleton — أول حاجة
 * بيعملها `startAlertSiren` إنها توقف أي صفّارة شغّالة. لو استخدمناها للرسالة،
 * رسالة جاية في نفس اللحظة كانت هتقطع **إنذار السيارة المطلوبة**، وده أهم
 * إنذار عند المندوب. فالاتنين مستقلين تماماً.
 */

/** نغمتين صاعدتين (نوتة G ثم C) — إحساس إشعار مش إنذار. */
const BEEPS = [784, 1047];
const BEEP_SEC = 0.14;
const GAP_SEC = 0.03;
/** هادية — تلفت النظر من غير ما تزعّق. */
const PEAK = 0.25;

let ctx: AudioContext | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/** هل النغمة شغّالة دلوقتي؟ */
export function isNoticeTonePlaying(): boolean {
  return ctx !== null;
}

/** بيرسم النغمة على سياق صوت — منفصلة عشان تتاخد بالاختبار بسياق وهمي. */
export function scheduleNoticeTone(c: AudioContext): number {
  const gain = c.createGain();
  gain.connect(c.destination);
  gain.gain.value = 0.0001;

  let at = c.currentTime;
  for (const freq of BEEPS) {
    const osc = c.createOscillator();
    osc.type = "sine";                // ناعمة — من غير الحدّة اللي في الـsquare
    osc.frequency.value = freq;
    osc.connect(gain);
    // fade سريع بدل قطع مفاجئ — يمنع الطقطقة في السماعة
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(PEAK, at + 0.02);
    // ذيل ناعم (زي الجرس) بدل قطع حاد
    gain.gain.exponentialRampToValueAtTime(0.0001, at + BEEP_SEC);
    osc.start(at);
    osc.stop(at + BEEP_SEC);
    at += BEEP_SEC + GAP_SEC;
  }
  return at - c.currentTime;          // المدة الكلية بالثواني
}

/** يشغّل النغمة مرة واحدة. لو شغّالة بالفعل مابيعملش حاجة. */
export function playNoticeTone(): void {
  if (ctx) return;
  if (typeof window === "undefined") return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    ctx.resume?.().catch(() => {});
    const secs = scheduleNoticeTone(ctx);
    closeTimer = setTimeout(stopNoticeTone, Math.ceil(secs * 1000) + 250);
  } catch {
    stopNoticeTone();
  }
}

/** يوقف النغمة ويقفل السياق. آمن لو مش شغّالة. */
export function stopNoticeTone(): void {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  try { void ctx?.close(); } catch { /* اتقفل خلاص */ }
  ctx = null;
}
