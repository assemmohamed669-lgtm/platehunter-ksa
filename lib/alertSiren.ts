/**
 * صفّارة إنذار «الحرب» (air-raid siren) — طنين عالٍ يعلو ويهبط ببطء، بيفضل
 * شغّال (loop) لحد ما المندوب يضغط «تم» فيوقف (stopAlertSiren).
 *
 * كله بالـ Web Audio — من غير أي ملف صوت، فيشتغل أوفلاين وعالي.
 * singleton: أي «تم» في أي مكان بيوقف الصفّارة.
 */
type AC = AudioContext;

let ctx: AC | null = null;
let osc: OscillatorNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;
let gain: GainNode | null = null;

/** يشغّل الصفّارة (لو شغّالة بالفعل، يعيد تشغيلها من الأول). */
export function startAlertSiren(): void {
  stopAlertSiren();
  if (typeof window === "undefined") return;
  try {
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    // بعض المتصفحات بتبدأ الـ context موقوف — نحاول نفكّه.
    ctx.resume?.().catch(() => {});

    // الطنين الأساسي — sawtooth عشان يبقى حاد وعالي (زي صفّارة الحرب).
    osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 600;

    // LFO بطيء (ربع هرتز = دورة كل 4 ثواني) بيعلي وينزّل التردد → الوااو المميز.
    lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 0.25;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 350; // يكنس التردد بين ~250 و~950 هرتز

    // مستوى صوت عالٍ مع fade-in سريع يمنع الطقطقة.
    gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.06);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    lfo.start();
  } catch {
    stopAlertSiren();
  }
}

/** يوقف الصفّارة فوراً. */
export function stopAlertSiren(): void {
  try { osc?.stop(); } catch { /* ignore */ }
  try { lfo?.stop(); } catch { /* ignore */ }
  try { osc?.disconnect(); } catch { /* ignore */ }
  try { lfo?.disconnect(); } catch { /* ignore */ }
  try { lfoGain?.disconnect(); } catch { /* ignore */ }
  try { gain?.disconnect(); } catch { /* ignore */ }
  try { ctx?.close(); } catch { /* ignore */ }
  osc = null; lfo = null; lfoGain = null; gain = null; ctx = null;
}

/** هل الصفّارة شغّالة دلوقتي؟ */
export function isAlertSirenPlaying(): boolean {
  return ctx !== null;
}
