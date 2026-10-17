/**
 * بوابة الكلام (Voice Activity Detection) — بتقرّر إمتى نبعت الصوت لخدمة التفريغ
 * (Deepgram) وإمتى نسكت. الفايدة: Deepgram بيحسب كل ثانية صوت بتتبعت طول ما
 * المايك مفتوح؛ فلو المندوب سايب التسجيل شغّال وساكت، بنوقف الإرسال فمايتحسبش —
 * وبنسيب الاتصال حيّ بـ KeepAlive. الصمت/الساعات الفاضية مش بتتبعت خالص.
 *
 * القرار مبني على طاقة الصوت (RMS) نسبةً لأرضية ضجيج **متكيّفة** — فبتشتغل في
 * البيئات الهادية والعربية اللي فيها ضجيج محرّك، من غير ما تقص بداية الكلام.
 *
 * `updateSpeechState` دالة نقية (قابلة للاختبار)؛ `createSpeechGate` بتلفّها حوالين
 * Web Audio AnalyserNode للاستخدام الحيّ.
 */

export interface SpeechGateState {
  noiseFloor: number;   // تقدير متحرّك لضجيج الخلفية (RMS 0..1)
  speaking: boolean;    // بنبعت دلوقتي؟ (كلام أو داخل فترة hangover)
  lastSpeechAt: number; // آخر لحظة (ms) اعتُبرت كلام
}

export interface SpeechGateOpts {
  hangoverMs: number;   // نفضل "بنبعت" المدة دي بعد ما الصوت يهدا (يغطّي وقفات نطق اللوحة)
  factor: number;       // كلام = طاقة أعلى من أرضية الضجيج بـ factor مرّة
  minEnergy: number;    // أقل طاقة تُعتبر كلام مهما كانت الأرضية (تمنع تشغيل على همس/صمت)
  floorAttack: number;  // سرعة صعود أرضية الضجيج (بطيئة — الكلام مايرفعهاش بسرعة)
  floorRelease: number; // سرعة نزول أرضية الضجيج (سريعة — تتبع الهدوء الجديد)
}

// hangover كبير نسبياً عشان الوقفات القصيرة بين حروف/أرقام اللوحة ماتقطعش الإرسال؛
// minEnergy يمنع الهمس/الصمت من التشغيل؛ factor يفصل الكلام عن أرضية الضجيج.
export const DEFAULT_GATE_OPTS: SpeechGateOpts = {
  hangoverMs: 1800,
  factor: 2.2,
  minEnergy: 0.008,
  floorAttack: 0.02,
  floorRelease: 0.2,
};

/** كل قد إيه نقيس الصوت (ms) — ~٥٠ فريم/ثانية، كفاية للـVAD وأخف من rAF. */
export const TICK_MS = 20;
/** لو مفيش قياس بقالنا أكتر من كده (ms) يبقى الحلقة متجمدة → نبعت كل الصوت. */
export const STALL_MS = 1500;

export function newSpeechGateState(): SpeechGateState {
  return { noiseFloor: 0.01, speaking: false, lastSpeechAt: -Infinity };
}

/**
 * يحدّث حالة البوابة بفريم طاقة جديد. نقية تماماً — الوقت (`now`) بيتمرّر من برّة
 * عشان تبقى قابلة للاختبار.
 */
export function updateSpeechState(
  s: SpeechGateState,
  energy: number,
  now: number,
  opts: SpeechGateOpts = DEFAULT_GATE_OPTS,
): SpeechGateState {
  // أرضية الضجيج: تنزل بسرعة للهدوء الجديد، وتصعد ببطء (عشان نبضة كلام قصيرة
  // ماترفعهاش، لكن ضجيج مستمر يتعرف عليه ويتّرفض مع الوقت).
  //
  // ⚠️ باج ميداني مثبت (٢٩ يوليو ٢٠٢٦): الأرضية كانت بتصعد **وإحنا بنبعت كلام**،
  // فكلام المندوب كان بيرفع العتبة اللي المفروض يعديها → البوابة تقفل على نفسها
  // بعد ~٢ ثانية من الكلام المتواصل وتفضل مقفولة (الصوت مايوصلش Deepgram خالص،
  // فمفيش لوحات تظهر لباقي الجلسة والمندوب يضطر يوقف التسجيل ويبدأ من جديد).
  // الحل (أسلوب VAD القياسي): الأرضية تتحدّث بس لما مانكونش بنبعت، أو لما الطاقة
  // تنزل تحتها (السكوت ينزّلها) — فالكلام عمره ما يرفع عتبة نفسه.
  const adapt = !s.speaking || energy < s.noiseFloor;
  const rate = energy < s.noiseFloor ? opts.floorRelease : opts.floorAttack;
  const noiseFloor = adapt ? s.noiseFloor + (energy - s.noiseFloor) * rate : s.noiseFloor;

  const isLoud = energy >= opts.minEnergy && energy > noiseFloor * opts.factor;
  const lastSpeechAt = isLoud ? now : s.lastSpeechAt;
  const speaking = isLoud || now - lastSpeechAt < opts.hangoverMs;

  return { noiseFloor, speaking, lastSpeechAt };
}

export interface SpeechGate {
  /** بنبعت الصوت دلوقتي؟ (كلام أو داخل hangover). */
  isSpeaking(): boolean;
  /** مستوى الصوت الحالي منعّم (٠..١) — لمؤشّر مستوى الصوت. */
  level(): number;
  /** يقفل الـ AudioContext ويوقف حلقة المراقبة. */
  close(): void;
}

/**
 * يبني بوابة كلام حيّة من MediaStream باستخدام Web Audio. بيرصد طاقة المايك كل
 * فريم ويحدّث الحالة. لو Web Audio مش متاح بيرمي — النداء لازم يعمل try/catch
 * ويرجع للإرسال المستمر (عشان مايضيّعش لوحات).
 */
export function createSpeechGate(
  stream: MediaStream,
  opts: SpeechGateOpts = DEFAULT_GATE_OPTS,
): SpeechGate {
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("AudioContext غير مدعوم");

  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  let state = newSpeechGateState();
  let smoothed = 0; // مستوى منعّم للعرض
  let closed = false;
  let lastTickAt = performance.now();

  const tick = () => {
    if (closed) return;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    smoothed = smoothed * 0.8 + rms * 0.2;
    lastTickAt = performance.now();
    state = updateSpeechState(state, rms, lastTickAt, opts);
  };
  // مؤقّت (مش requestAnimationFrame): الـrAF بيتوقف تماماً لما التطبيق يبقى في
  // الخلفية أو الشاشة تتقفل — فالحالة كانت بتتجمد على «مفيش كلام» = صمت دائم.
  const timer = setInterval(tick, TICK_MS);

  return {
    // fail-open: لو حلقة القياس اتجمدت/اتخنقت (خلفية، شاشة مقفولة، جهاز مشغول)
    // نبعت كل الصوت بدل ما نضيّع لوحات — الأمان أهم من توفير الفاتورة.
    isSpeaking: () => (performance.now() - lastTickAt > STALL_MS ? true : state.speaking),
    level: () => Math.min(1, smoothed * 8), // rms كلام ~0.02-0.12 → 0..1
    close: () => {
      closed = true;
      clearInterval(timer);
      try { source.disconnect(); } catch { /* already gone */ }
      try { void ctx.close(); } catch { /* already closed */ }
    },
  };
}
