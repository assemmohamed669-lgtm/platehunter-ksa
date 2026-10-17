/**
 * ==========================================================================
 *  نغمات التنبيه — قنّاص إكس (٢٠ نغمة)
 * ==========================================================================
 *  المندوب بيختار نغمة تطابق اللوحة المطلوبة من القائمة الجانبية. كلها
 *  مكتوبة بالـ Web Audio — بلا أي ملف صوت، فبتشتغل أوفلاين وفوراً ومن أول
 *  لمسة. النغمة بتفضل شغّالة (loop) لحد ما المندوب يوقّفها بإيده، لأن
 *  اللوحة المطلوبة هي كل سبب وجود البرنامج فتنبيهها لازم يبقى مستحيل يفوت.
 *
 *  ثلاث فئات: صفّارة (سويب مستمر) · جرس (رنين متكرّر) · كلاسيك (نغمات).
 */

export type ToneCat = "صفّارة" | "جرس" | "كلاسيك";

export interface ToneDef {
  id: string;
  name: string;
  cat: ToneCat;
}

/** النغمة الافتراضية = صفّارة الحرب القديمة */
export const DEFAULT_TONE = "war";

export const TONES: ToneDef[] = [
  // ── صفّارات (سويب مستمر) ──
  { id: "war", name: "صفّارة حرب", cat: "صفّارة" },
  { id: "police", name: "شرطة", cat: "صفّارة" },
  { id: "hilo", name: "هاي-لو", cat: "صفّارة" },
  { id: "yelp", name: "يلب سريع", cat: "صفّارة" },
  { id: "airraid", name: "غارة جوية", cat: "صفّارة" },
  { id: "ambulance", name: "إسعاف", cat: "صفّارة" },
  { id: "laser", name: "ليزر", cat: "صفّارة" },
  // ── أجراس ──
  { id: "bell", name: "جرس كلاسيك", cat: "جرس" },
  { id: "belldouble", name: "جرس مزدوج", cat: "جرس" },
  { id: "chime", name: "دقّات ثلاثية", cat: "جرس" },
  { id: "dingdong", name: "دينج-دونج", cat: "جرس" },
  { id: "school", name: "جرس مدرسة", cat: "جرس" },
  { id: "glass", name: "زجاج", cat: "جرس" },
  { id: "sonar", name: "سونار", cat: "جرس" },
  // ── كلاسيك (نغمات) ──
  { id: "triple", name: "ثلاث نبضات", cat: "كلاسيك" },
  { id: "pulse", name: "نبض ثابت", cat: "كلاسيك" },
  { id: "urgent", name: "عاجل", cat: "كلاسيك" },
  { id: "alarm", name: "منبّه", cat: "كلاسيك" },
  { id: "digital", name: "رقمي", cat: "كلاسيك" },
  { id: "heartbeat", name: "نبض القلب", cat: "كلاسيك" },
];

/* ─────────────────────────────── تخزين الاختيار ────────────────────────── */

const KEY = "qx:tone";

export function getSelectedTone(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && TONES.some((t) => t.id === v)) return v;
  } catch {
    /* التخزين مقفول */
  }
  return DEFAULT_TONE;
}

export function setSelectedTone(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* التخزين مقفول */
  }
}

/* ─────────────────────────────── محرّك الصوت ───────────────────────────── */

function makeCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

/** نغمة واحدة مجدوَلة (بوابة أو رنين متلاشي) */
function note(
  ctx: AudioContext,
  master: GainNode,
  o: {
    freq: number;
    at: number;
    dur: number;
    type?: OscillatorType;
    vol?: number;
    glideTo?: number;
    decay?: boolean;
  }
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? "sine";
  const t0 = ctx.currentTime + o.at;
  const t1 = t0 + o.dur;
  const vol = o.vol ?? 0.3;

  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.glideTo != null) osc.frequency.linearRampToValueAtTime(o.glideTo, t1);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  if (o.decay) {
    // رنين جرس — تلاشي أُسّي من أول ما يبدأ
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
  } else {
    g.gain.setValueAtTime(vol, Math.max(t0 + 0.01, t1 - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
  }

  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t1 + 0.04);
}

/** رنين جرس بتوافقيّات (base + خامس + ثامن) */
function bell(ctx: AudioContext, master: GainNode, at: number, base: number, vol = 0.34): void {
  note(ctx, master, { freq: base, at, dur: 1.0, type: "sine", vol, decay: true });
  note(ctx, master, { freq: base * 2.01, at, dur: 0.7, type: "sine", vol: vol * 0.5, decay: true });
  note(ctx, master, { freq: base * 3.0, at, dur: 0.45, type: "sine", vol: vol * 0.28, decay: true });
}

/** صفّارة سويب مستمرّة: حامل + LFO على التردد. يرجّع العُقد عشان توقفها. */
function siren(
  ctx: AudioContext,
  master: GainNode,
  o: { carrier: number; type: OscillatorType; lfoHz: number; depth: number; lfoType?: OscillatorType }
): OscillatorNode[] {
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.value = o.carrier;

  const lfo = ctx.createOscillator();
  lfo.type = o.lfoType ?? "triangle";
  lfo.frequency.value = o.lfoHz;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = o.depth;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 0.06);

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.connect(g).connect(master);
  osc.start();
  lfo.start();
  return [osc, lfo];
}

/**
 * تعريف محرّك كل نغمة:
 *  - continuous: عُقد بتفضل شغّالة (صفّارات)
 *  - cycle: نمط بيتجدوَل كل period ثانية (أجراس/نغمات)
 */
type Engine =
  | { kind: "continuous"; build: (ctx: AudioContext, master: GainNode) => OscillatorNode[] }
  | { kind: "cycle"; period: number; play: (ctx: AudioContext, master: GainNode) => void };

function engineFor(id: string): Engine {
  switch (id) {
    // ── صفّارات ──
    case "war":
      return { kind: "continuous", build: (c, m) => siren(c, m, { carrier: 600, type: "sawtooth", lfoHz: 0.25, depth: 350 }) };
    case "police":
      return { kind: "continuous", build: (c, m) => siren(c, m, { carrier: 750, type: "sine", lfoHz: 0.9, depth: 420, lfoType: "sine" }) };
    case "airraid":
      return { kind: "continuous", build: (c, m) => siren(c, m, { carrier: 520, type: "sawtooth", lfoHz: 0.5, depth: 420 }) };
    case "hilo":
      return {
        kind: "cycle",
        period: 1.0,
        play: (c, m) => {
          note(c, m, { freq: 820, at: 0, dur: 0.45, type: "square", vol: 0.28 });
          note(c, m, { freq: 610, at: 0.5, dur: 0.45, type: "square", vol: 0.28 });
        },
      };
    case "yelp":
      return {
        kind: "cycle",
        period: 0.3,
        play: (c, m) => note(c, m, { freq: 680, at: 0, dur: 0.27, type: "sawtooth", vol: 0.3, glideTo: 1450 }),
      };
    case "ambulance":
      return {
        kind: "cycle",
        period: 1.2,
        play: (c, m) => {
          note(c, m, { freq: 960, at: 0, dur: 0.55, type: "sine", vol: 0.32 });
          note(c, m, { freq: 770, at: 0.6, dur: 0.55, type: "sine", vol: 0.32 });
        },
      };
    case "laser":
      return {
        kind: "cycle",
        period: 0.9,
        play: (c, m) => note(c, m, { freq: 1600, at: 0, dur: 0.4, type: "sawtooth", vol: 0.28, glideTo: 300 }),
      };

    // ── أجراس ──
    case "bell":
      return { kind: "cycle", period: 1.3, play: (c, m) => bell(c, m, 0, 660) };
    case "belldouble":
      return { kind: "cycle", period: 1.5, play: (c, m) => { bell(c, m, 0, 880, 0.3); bell(c, m, 0.28, 660, 0.3); } };
    case "chime":
      return { kind: "cycle", period: 1.9, play: (c, m) => { bell(c, m, 0, 523, 0.3); bell(c, m, 0.18, 659, 0.3); bell(c, m, 0.36, 784, 0.3); } };
    case "dingdong":
      return { kind: "cycle", period: 1.6, play: (c, m) => { bell(c, m, 0, 660, 0.34); bell(c, m, 0.5, 520, 0.34); } };
    case "school":
      return { kind: "cycle", period: 0.12, play: (c, m) => note(c, m, { freq: 760, at: 0, dur: 0.085, type: "square", vol: 0.26 }) };
    case "glass":
      return { kind: "cycle", period: 1.5, play: (c, m) => { note(c, m, { freq: 1200, at: 0, dur: 1.1, type: "sine", vol: 0.3, decay: true }); note(c, m, { freq: 2410, at: 0, dur: 0.5, type: "sine", vol: 0.12, decay: true }); } };
    case "sonar":
      return { kind: "cycle", period: 1.5, play: (c, m) => note(c, m, { freq: 720, at: 0, dur: 0.55, type: "sine", vol: 0.3, glideTo: 680, decay: true }) };

    // ── كلاسيك ──
    case "triple":
      return {
        kind: "cycle",
        period: 1.5,
        play: (c, m) => { note(c, m, { freq: 1046, at: 0, dur: 0.1 }); note(c, m, { freq: 1046, at: 0.16, dur: 0.1 }); note(c, m, { freq: 1046, at: 0.32, dur: 0.1 }); },
      };
    case "pulse":
      return { kind: "cycle", period: 0.6, play: (c, m) => note(c, m, { freq: 880, at: 0, dur: 0.14, type: "square", vol: 0.26 }) };
    case "urgent":
      return { kind: "cycle", period: 0.24, play: (c, m) => note(c, m, { freq: 1200, at: 0, dur: 0.13, type: "square", vol: 0.3 }) };
    case "alarm":
      return {
        kind: "cycle",
        period: 1.4,
        play: (c, m) => { for (let i = 0; i < 4; i++) note(c, m, { freq: 800, at: i * 0.18, dur: 0.1, type: "square", vol: 0.28 }); },
      };
    case "digital":
      return {
        kind: "cycle",
        period: 1.2,
        play: (c, m) => { for (let i = 0; i < 6; i++) note(c, m, { freq: i % 2 ? 1500 : 1000, at: i * 0.11, dur: 0.09, type: "square", vol: 0.26 }); },
      };
    case "heartbeat":
      return {
        kind: "cycle",
        period: 1.0,
        play: (c, m) => { note(c, m, { freq: 180, at: 0, dur: 0.14, type: "sine", vol: 0.45, decay: true }); note(c, m, { freq: 150, at: 0.22, dur: 0.18, type: "sine", vol: 0.42, decay: true }); },
      };

    default:
      return engineFor(DEFAULT_TONE);
  }
}

/* ───────────────────────── تشغيل / إيقاف (يرجّع دالة إيقاف) ─────────────── */

/** يشغّل نغمة بالـid ويرجّع دالة توقفها. */
export function startTone(id: string): () => void {
  const ctx = makeCtx();
  if (!ctx) return () => {};
  void ctx.resume?.().catch(() => {});

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const eng = engineFor(id);
  let iv: ReturnType<typeof setInterval> | null = null;
  let nodes: OscillatorNode[] = [];

  if (eng.kind === "continuous") {
    nodes = eng.build(ctx, master);
  } else {
    const run = () => {
      try {
        eng.play(ctx, master);
      } catch {
        /* ignore */
      }
    };
    run();
    iv = setInterval(run, eng.period * 1000);
  }

  return () => {
    if (iv) clearInterval(iv);
    for (const n of nodes) {
      try { n.stop(); } catch { /* ignore */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    try { master.disconnect(); } catch { /* ignore */ }
    try { void ctx.close(); } catch { /* ignore */ }
  };
}

/** معاينة نغمة (بتشتغل شوية وتقف لوحدها) — للقائمة الجانبية. */
let previewStop: (() => void) | null = null;
export function previewTone(id: string, ms = 2200): void {
  previewStop?.();
  const stop = startTone(id);
  previewStop = stop;
  window.setTimeout(() => {
    stop();
    if (previewStop === stop) previewStop = null;
  }, ms);
}

/* ─────────────── تنبيه اللوحة المطلوبة (النغمة المختارة) ──────────── */

let activeStop: (() => void) | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * أقصى مدة للتنبيه قبل ما يقف لوحده (ملّي ثانية).
 *
 * 🔴 قبل كده كان بيفضل شغّال لحد ما المندوب يضغط «تم» — فكان بيصرخ عالي فوق
 * اللوحات اللي بيقولها بعد المطلوبة ويشوّش الميك. دلوقتي بيقف لوحده بعد المدة
 * دي (لسه عالي ومسموع، و«تم» بتقفله بدري)، فما ياكلش اللوحات الجايّة.
 */
const ALERT_MAX_MS = 5000;

/** يشغّل النغمة المختارة كتنبيه — بيقف لوحده بعد ALERT_MAX_MS أو بـ«تم». */
export function playSelectedAlert(): void {
  stopActiveAlert();
  activeStop = startTone(getSelectedTone());
  autoStopTimer = setTimeout(stopActiveAlert, ALERT_MAX_MS);
}

/** يوقف تنبيه اللوحة المطلوبة الشغّال دلوقتي. */
export function stopActiveAlert(): void {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  activeStop?.();
  activeStop = null;
}

export function isAlertActive(): boolean {
  return activeStop !== null;
}
