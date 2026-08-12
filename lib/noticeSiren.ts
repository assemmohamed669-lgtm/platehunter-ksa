/**
 * noticeSiren — صفّارة «الرسالة العاجلة» من الأدمن.
 *
 * **ليه منفصلة عن `alertSiren`:** صفّارة السيارة المطلوبة singleton — أول حاجة
 * بيعملها `startAlertSiren` إنها توقف أي صفّارة شغّالة. لو استخدمناها للرسالة،
 * رسالة جاية في نفس اللحظة كانت هتقطع **إنذار السيارة المطلوبة**، وده أهم إنذار
 * عند المندوب. فالاتنين مستقلين تماماً ويقدروا يشتغلوا مع بعض.
 *
 * بتفضل رنّانة (loop) لحد ما المندوب يقفل الرسالة — بطلب المندوب.
 */

let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;
let gain: GainNode | null = null;

/** هل صفّارة الرسالة شغّالة دلوقتي؟ */
export function isNoticeSirenPlaying(): boolean {
  return ctx !== null;
}

/**
 * يشغّل الصفّارة. لو شغّالة بالفعل مابيعملش حاجة (عشان إعادة الرسم أو نبضة
 * التحديث كل دقيقة ماتعملش صفّارة فوق صفّارة).
 */
export function startNoticeSiren(): void {
  if (ctx) return;
  if (typeof window === "undefined") return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    ctx.resume?.().catch(() => {});

    // طنين حاد (sawtooth) بيعلو ويهبط — نفس إحساس صفّارة الإنذار، بس أهدى
    // شوية من صفّارة السيارة المطلوبة عشان المندوب يفرّق بينهم بالأذن.
    osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 520;

    lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 0.5;          // دورة كل ثانيتين
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;           // يكنس بين ~260 و~780 هرتز

    gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.08);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    lfo.start();
  } catch {
    stopNoticeSiren();
  }
}

/** يوقف الصفّارة فوراً. آمن لو مش شغّالة. */
export function stopNoticeSiren(): void {
  try { osc?.stop(); } catch { /* ignore */ }
  try { lfo?.stop(); } catch { /* ignore */ }
  try { osc?.disconnect(); } catch { /* ignore */ }
  try { lfo?.disconnect(); } catch { /* ignore */ }
  try { lfoGain?.disconnect(); } catch { /* ignore */ }
  try { gain?.disconnect(); } catch { /* ignore */ }
  try { void ctx?.close(); } catch { /* ignore */ }
  osc = null; lfo = null; lfoGain = null; gain = null; ctx = null;
}
