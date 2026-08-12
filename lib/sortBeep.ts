/**
 * sortBeep — نغمة قصيرة بتطلع أول ما المندوب يضغط زر الفرز، تأكيد إن البرنامج
 * بدأ فعلاً (الفرز على ملف كبير بياخد ثواني والشاشة بتفضل ساكتة).
 *
 * كله بالـ Web Audio — من غير أي ملف صوت، فيشتغل أوفلاين وسريع (بيبدأ فوراً
 * من غير تحميل). نغمتين صاعدتين قصيرين عشان يبان إنه «بدأ» مش «إنذار».
 *
 * آمن في كل الحالات: لو المتصفّح مامعاهوش Web Audio، أو الصوت مقفول، أو
 * الجهاز رافض التشغيل — بيرجع بهدوء من غير ما يوقف الفرز.
 */

/** ترددات النغمتين (هرتز) ومدة كل واحدة (ثانية). */
const TONES = [660, 990];
const TONE_SEC = 0.075;
const GAP_SEC = 0.02;

/** مسار الصوت بيتقفل بعد ما يخلص — عشان مانسيبش موارد مفتوحة. */
const TAIL_MS = 400;

/**
 * بيبني رسم النغمة على AudioContext — دالة منفصلة عشان تتاخد بالاختبار
 * بسياق وهمي من غير متصفّح حقيقي.
 */
export function scheduleSortBeep(ctx: AudioContext): void {
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = 0.0001;

  let at = ctx.currentTime;
  for (const freq of TONES) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    // fade سريع جداً بدل قطع مفاجئ — يمنع الطقطقة في السماعة.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + TONE_SEC);
    osc.start(at);
    osc.stop(at + TONE_SEC);
    at += TONE_SEC + GAP_SEC;
  }
}

/** يشغّل نغمة «بدأ الفرز». مابيرميش أي خطأ مهما حصل. */
export function playSortBeep(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    // بعض المتصفّحات بتبدأ الـ context موقوف لحد أول لمسة — والضغط على الزر
    // هو لمسة، فالـ resume بينجح.
    ctx.resume?.().catch(() => {});
    scheduleSortBeep(ctx);
    setTimeout(() => { try { void ctx.close(); } catch { /* اتقفل خلاص */ } }, TAIL_MS);
  } catch { /* الصوت مش متاح — الفرز بيكمّل عادي */ }
}
