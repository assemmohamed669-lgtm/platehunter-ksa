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
 *
 * 🔔 «نغمة التحصيل» (المالك ١٤ أكتوبر ٢٠٢٦ — `lib/alertTones.ts`): لو المندوب اختار نغمة، بتلف بدل الصفّارة لحد «تم»
 * على **نفس الـcontext المفكوك** (ملف متحمّل ومتفكوك في الذاكرة ⇒ بيشتغل من رد الشبكة زي الصفّارة بالظبط). لو ملفها
 * لسه ماتحمّلش (نت ضعيف/أوفلاين) ⇒ الصفّارة العادية فوراً — التنبيه عمره ما يسكت — وبيبدأ يحمّلها للمرة الجاية.
 */
import { alertToneById, loadAlertToneId, type AlertTone } from "./alertTones";

type AC = AudioContext;

let ctx: AC | null = null;
let osc: OscillatorNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;
let gain: GainNode | null = null;
/** النغمة المختارة وهي بترن (بدل osc/lfo). */
let src: AudioBufferSourceNode | null = null;
let srcGain: GainNode | null = null;
let playing = false;
/** «اسمع» في الإعدادات ولا تنبيه حقيقي — المعاينة عمرها ما توقف تنبيه حقيقي. */
let kind: "alert" | "preview" | null = null;
/** بيزيد مع كل معاينة/إيقاف — معاينة قديمة خلص تحميلها متأخر ماتشتغلش. */
let previewSeq = 0;

/** النغمات المتحمّلة والمتفكوكة — أقصاها ٢ (كل واحدة ~٦ ميجا في الذاكرة). */
const MAX_BUFFERS = 2;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

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

/**
 * يشغّل تنبيه المطلوب (لو شغّال بالفعل، يعيده من الأول): النغمة المختارة لو متحمّلة، وإلا الصفّارة.
 * بيلف لحد «تم» (`stopAlertSiren`).
 */
export function startAlertSiren(): void {
  stopNodes();
  const c = getCtx();
  if (!c) return;
  // احتياطي — الأصل إنه اتفكّ بلمسة قبل كده؛ ده بيلحق الحالات اللي فيها لمسة حيّة.
  c.resume?.().catch(() => {});
  const tone = alertToneById(loadAlertToneId());
  if (tone.file) {
    const buf = buffers.get(tone.id);
    if (buf && playBuffer(c, buf, true)) { kind = "alert"; return; }
    void loadToneBuffer(tone); // لسه ماتحمّلتش ⇒ الصفّارة دلوقتي، والنغمة للمرة الجاية
  }
  startOscSiren(c);
  if (playing) kind = "alert";
}

/**
 * يحمّل النغمة المختارة (أو `id`) ويفكّها في الذاكرة عشان التنبيه يرن بيها على طول. بيتنده أول ما التطبيق يفتح ولما
 * المندوب يختار نغمة. true = جاهزة (أو الاختيار هو الصفّارة اللي مش محتاجة تحميل).
 */
export async function preloadAlertTone(id?: string): Promise<boolean> {
  const tone = alertToneById(id ?? loadAlertToneId());
  if (!tone.file) return true;
  return (await loadToneBuffer(tone)) !== null;
}

/**
 * «اسمع» في صفحة الإعدادات — النغمة مرة واحدة (مش لفّة)، والصفّارة ٤ ثواني. لازم تتنده من ضغطة (بتفكّ الصوت).
 * false = ماشتغلتش (التحميل فشل، أو تنبيه حقيقي اشتغل في النص، أو معاينة أحدث).
 */
export async function previewAlertTone(id: string): Promise<boolean> {
  stopNodes();
  const my = ++previewSeq;
  const c = getCtx();
  if (!c) return false;
  c.resume?.().catch(() => {});
  const tone = alertToneById(id);
  if (!tone.file) {
    startOscSiren(c);
    if (!playing) return false;
    kind = "preview";
    setTimeout(() => { if (kind === "preview" && my === previewSeq) stopNodes(); }, 4000);
    return true;
  }
  const buf = await loadToneBuffer(tone);
  if (!buf || my !== previewSeq || playing) return false;
  if (!playBuffer(c, buf, false)) return false;
  kind = "preview";
  return true;
}

function loadToneBuffer(tone: AlertTone): Promise<AudioBuffer | null> {
  if (!tone.file) return Promise.resolve(null);
  const have = buffers.get(tone.id);
  if (have) return Promise.resolve(have);
  const inflight = loading.get(tone.id);
  if (inflight) return inflight;
  const c = getCtx();
  if (!c) return Promise.resolve(null);
  const file = tone.file;
  const p = (async () => {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`tone ${res.status}`);
    return c.decodeAudioData(await res.arrayBuffer());
  })()
    .then((buf) => {
      buffers.delete(tone.id);
      buffers.set(tone.id, buf);
      while (buffers.size > MAX_BUFFERS) buffers.delete(buffers.keys().next().value as string);
      return buf as AudioBuffer | null;
    })
    .catch(() => null) // أوفلاين/ملف بايظ — المرة الجاية بيحاول تاني
    .finally(() => { loading.delete(tone.id); });
  loading.set(tone.id, p);
  return p;
}

/** يشغّل نغمة متفكوكة على الـcontext المفكوك. `loop` = تنبيه حقيقي (لحد «تم») · من غيره = معاينة مرة واحدة. */
function playBuffer(c: AC, buf: AudioBuffer, loop: boolean): boolean {
  try {
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(1, c.currentTime + 0.06);
    s.connect(g);
    g.connect(c.destination);
    s.onended = () => { if (src === s) stopNodes(); };
    s.start();
    src = s; srcGain = g;
    playing = true;
    return true;
  } catch {
    stopNodes();
    return false;
  }
}

/** صفّارة الحرب (Web Audio من غير ملف) — الافتراضي، والاحتياطي لو النغمة المختارة لسه ماتحمّلتش. */
function startOscSiren(c: AC): void {
  try {
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
  const s = src;
  src = null; // قبل stop: onended بتاعها مايلمسش اللي بعدها
  try { s?.stop(); } catch { /* ignore */ }
  try { s?.disconnect(); } catch { /* ignore */ }
  try { srcGain?.disconnect(); } catch { /* ignore */ }
  osc = null; lfo = null; lfoGain = null; gain = null; srcGain = null;
  playing = false;
  kind = null;
}

/** يوقف التنبيه (صفّارة أو نغمة أو معاينة) فوراً — الـcontext بيفضل حيّ (مفكوك) للمرة الجاية. */
export function stopAlertSiren(): void {
  previewSeq++;
  stopNodes();
}

/** يوقف «اسمع» بس (والمعاينة اللي لسه بتتحمّل) — تنبيه مطلوب حقيقي شغّال بيكمّل. */
export function stopAlertTonePreview(): void {
  previewSeq++;
  if (kind === "preview") stopNodes();
}

/** هل الصفّارة شغّالة دلوقتي؟ */
export function isAlertSirenPlaying(): boolean {
  return playing;
}
