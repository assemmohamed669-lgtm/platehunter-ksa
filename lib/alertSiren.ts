/**
 * صفّارة إنذار «الحرب» (air-raid siren) — طنين عالٍ يعلو ويهبط ببطء، بيفضل
 * شغّال (loop) لحد ما المندوب يضغط «تم» فيوقف (stopAlertSiren).
 *
 * كله بالـ Web Audio — من غير أي ملف صوت، فيشتغل أوفلاين وعالي.
 * singleton: أي «تم» في أي مكان بيوقف الصفّارة.
 *
 * ⚠️ مهم (إصلاح «الصوت مابيصفّرش في التشييك الصوتي»): على الموبايل/WebView أي
 * AudioContext بيبدأ **موقوف (suspended)** ومابيتفكّش إلا جوّه لمسة/ضغطة من
 * المستخدم. لو عملنا context جديد كل مرة (زي قبل كده) الصفّارة بتشتغل بس في
 * اليدوي/الكاميرا (التطابق جوّه اللمسة)، وبتفضل ساكتة في الصوت لأن التطابق
 * بييجي في **رد شبكة** بعد ما المندوب ساب الزر (مافيش لمسة فعّالة). فبنمسك
 * **context واحد ثابت** بنفكّه من أول لمسة (`ensureSirenAudioUnlocked`) ونعيد
 * استخدامه — فالصفّارة تشتغل لأي لوحة مطلوبة مهما كان مصدر التطابق.
 */
type AC = AudioContext;

let ctx: AC | null = null;
let osc: OscillatorNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;
let gain: GainNode | null = null;
let playing = false;

/** الـcontext الثابت (بيتعمل مرة واحدة). null لو المتصفّح مافيهوش Web Audio. */
function getCtx(): AC | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { ctx = null; }
  return ctx;
}

/**
 * يفكّ قفل الصوت — **لازم يتنده جوّه لمسة/ضغطة من المستخدم** (أول لمسة في
 * الصفحة، أو ضغطة زر الصوت). مرة واحدة بتكفي، وتكراره آمن (resume على context
 * شغّال = بلا أثر). بعد الفكّ، الصفّارة تقدر تشتغل من أي رد شبكة لاحق.
 */
export function ensureSirenAudioUnlocked(): void {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume?.().catch(() => {});
}

/** يشغّل الصفّارة (لو شغّالة بالفعل، يعيد تشغيلها من الأول). */
export function startAlertSiren(): void {
  stopNodes();
  const c = getCtx();
  if (!c) return;
  try {
    // احتياطي — الأصل إنه اتفكّ بلمسة قبل كده؛ ده بيلحق الحالات اللي فيها لمسة حيّة.
    c.resume?.().catch(() => {});

    // الطنين الأساسي — sawtooth عشان يبقى حاد وعالي (زي صفّارة الحرب).
    osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 600;

    // LFO بطيء (ربع هرتز = دورة كل 4 ثواني) بيعلي وينزّل التردد → الوااو المميز.
    lfo = c.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 0.25;
    lfoGain = c.createGain();
    lfoGain.gain.value = 350; // يكنس التردد بين ~250 و~950 هرتز

    // مستوى صوت عالٍ مع fade-in سريع يمنع الطقطقة.
    gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.9, c.currentTime + 0.06);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(c.destination);

    osc.start();
    lfo.start();
    playing = true;
  } catch {
    stopNodes();
  }
}

/** يوقّف عُقد الصوت الحالية (بيسيب الـcontext حيّ عشان الصفّارة الجاية تشتغل فوراً). */
function stopNodes(): void {
  try { osc?.stop(); } catch { /* ignore */ }
  try { lfo?.stop(); } catch { /* ignore */ }
  try { osc?.disconnect(); } catch { /* ignore */ }
  try { lfo?.disconnect(); } catch { /* ignore */ }
  try { lfoGain?.disconnect(); } catch { /* ignore */ }
  try { gain?.disconnect(); } catch { /* ignore */ }
  osc = null; lfo = null; lfoGain = null; gain = null;
  playing = false;
}

/** يوقف الصفّارة فوراً — الـcontext بيفضل حيّ (مفكوك) للمرة الجاية. */
export function stopAlertSiren(): void {
  stopNodes();
}

/** هل الصفّارة شغّالة دلوقتي؟ */
export function isAlertSirenPlaying(): boolean {
  return playing;
}
