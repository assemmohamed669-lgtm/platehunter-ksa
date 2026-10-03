import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MISSED_CAP, REPLAY_MAX_AGE_SEC } from "@/lib/voicexReplay";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🐢 وضع النت الضعيف (`netResilience`) — المحرّك نفسه، بشبكة مزيّفة
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٣ أكتوبر ٢٠٢٦): «خلي ده مايحصلش غير في حالة النت الضعيف أوي فقط
 * لأنه هيأخر ظهور اللوحات وكمان هيتقل الموبايل مع المندوب، فدي تبقى في
 * الضرورة القصوى فقط».
 *
 * فالاختبارات دي بتثبت:
 *   ① **بلا العلم** = سلوك النهارده بالحرف (onFatal عند الفشل الـ٨ وبيتكرّر).
 *   ② **بالعلم** الوضع مابيبدأش غير **في نفس اللحظة** اللي النهارده كان
 *      المحرّك بيستسلم فيها — وقبلها مافيش ولا فرق — و**لنت الموبايل بس**
 *      (`timeout`/`network`/`no_response`). السيرفر/النفق لو **رد** (429/5xx/
 *      52x…) ⇒ وقوع `server_down` زي النهارده عند الـ٨ — مش «نت ضعيف».
 *   ③ وجوّه الوضع الموبايل بيشتغل **أقل** مش أكتر: جسّة واحدة على فترات
 *      بتطول، والفايت بيتسجّل (محدود) ويرجع لما الشبكة ترجع.
 *   ④ ٣ دقايق من غير ولا رد ناجح ⇒ `net_lost` مرة واحدة ومافيش إرسال بعدها.
 *   ⑤ الإيقاف بعد الوضع **خفيف**: ميزانية ١٥ث / ١٦ إعادة، الأحدث الأول.
 *   ⑥ نفق ميت بيوصل كـ`network` زي الموبايل الأوفلاين بالظبط — `checkReachable`
 *      (فحص `/health` no-cors) بيفرّق: واصل + الجسّة لسه `network` ⇒
 *      `server_down`/`tunnel_error` في ثواني، مش «النت ضعيف» ٣ دقايق.
 *   ⑦ الاستسلام بدليل من جسّة **بدأت** بعد الـ١٨٠ث بس (نت رجع عند ١٧٩ث يتلقط).
 *   ⑧ سلسلة مخلوطة: التوكن في أي مكان يكسب، وغير كده **الأغلبية** من الـ٨.
 *
 * الميك والكاشف والشبكة مزيّفين — المؤقّتات والإجماع والإعادة حقيقية.
 */

const h = vi.hoisted(() => ({
  vad: null as null | {
    onSpeechStart?: () => void;
    onUtterance?: (u: { startSec: number; endSec: number }) => void;
  },
  micFails: false,
  /** كل مقطع اتقصّ ⇒ مداه الزمني — عشان السيرفر المزيّف يعرف فيه لوحة ولا لأ.
   *  `at` = ساعة الميك لحظة القصّ (عشان نعرف عمر الصوت اللي اتقصّ). */
  slices: new Map<Blob, { from: number; to: number; at: number }>(),
  mic: null as null | { readonly elapsedSec: number },
}));

vi.mock("@/lib/micEngine", () => {
  class MicEngine {
    sampleRate = 16000;
    private started = false;
    private t0 = 0;
    constructor(_o: unknown) { /* المؤقّتات بس اللي تهمّنا */ }
    async start() {
      if (h.micFails) throw new Error("denied");
      this.started = true; this.t0 = Date.now();
      h.mic = this;
    }
    get elapsedSec() { return this.started ? (Date.now() - this.t0) / 1000 : 0; }
    sliceQuality() { return null; }   // بلا بوابة سكوت — كل نافذة فيها كلام
    sliceWav(from: number, to: number) {
      const b = new Blob([new Uint8Array(4096)], { type: "audio/wav" });
      h.slices.set(b, { from, to, at: this.elapsedSec });
      return b;
    }
    stop() { /* لا شيء */ }
  }
  return { MicEngine, LIVE_RING_SECONDS: 90 };
});

vi.mock("@/lib/vad", () => ({
  Vad: class {
    lastVoiceEndSec = 0;
    constructor(o: NonNullable<typeof h.vad>) { h.vad = o; }
    push() { /* لا شيء */ }
  },
}));

vi.mock("@/lib/plateJudgeClient", () => ({ postAudioForPlate: vi.fn() }));

import { postAudioForPlate } from "@/lib/plateJudgeClient";
import {
  startVoicexEngine, fatalReasonFor, isWeakNetFailure,
  WEAK_NET_GIVE_UP_MS, NET_STOP_BUDGET_MS, NET_STOP_MAX_REPLAYS,
  type VoicexEngineOpts,
} from "@/lib/voicexEngine";

/** الشبكة المزيّفة: نتيجة كل طلب بتتقرّر **لحظة رجوعه** (زي الواقع). */
const net = {
  up: true,
  /** لو متحدّد بيغلب `up`: نجاح الطلب رقم i (من ٠) */
  okFor: null as null | ((i: number) => boolean),
  latencyMs: 400,
  sends: [] as number[],
  /** المدى الزمني لكل طلب (من المقطع) */
  ranges: [] as Array<{ from: number; to: number; at: number } | undefined>,
  inflight: 0,
  maxInflight: 0,
  failures: 0,
  /** لوحة اتقالت في [from,to] ثواني صوت — أي نافذة بتغطّيها بتقراها */
  plate: null as null | { from: number; to: number; text: string },
  /** كود الفشل اللي طبقة الشبكة بتقوله (`onError`) — `null` = ولا كود (`no_response`) */
  code: "timeout" as string | null,
  /** لو متحدّد بيغلب `code`: كود فشل الطلب رقم i */
  codeFor: null as null | ((i: number) => string | null),
  /** لو متحدّد بيغلب `latencyMs`: زمن رحلة الطلب رقم i (بيتقرّر لحظة الإرسال) */
  latencyFor: null as null | ((i: number) => number),
};

function resetNet() {
  net.up = true; net.okFor = null; net.latencyMs = 400;
  net.sends = []; net.ranges = []; net.inflight = 0; net.maxInflight = 0; net.failures = 0;
  net.plate = null; net.code = "timeout"; net.codeFor = null; net.latencyFor = null;
  h.slices.clear(); h.vad = null; h.micFails = false; h.mic = null;
}

const post = vi.mocked(postAudioForPlate);

function installServer() {
  post.mockImplementation((wav: Blob, o: { onError?: (c: string) => void }) => {
    const idx = net.sends.length;
    net.sends.push(Date.now());
    const w = h.slices.get(wav);
    net.ranges.push(w);
    net.inflight += 1;
    net.maxInflight = Math.max(net.maxInflight, net.inflight);
    const lat = net.latencyFor ? net.latencyFor(idx) : net.latencyMs;
    return new Promise((res) => setTimeout(() => {
      net.inflight -= 1;
      const ok = net.okFor ? net.okFor(idx) : net.up;
      if (!ok) {
        net.failures += 1;
        const code = net.codeFor ? net.codeFor(idx) : net.code;
        if (code) o.onError?.(code);
        res(null); return;
      }
      const p = net.plate;
      const hit = !!(p && w && w.from < p.to && w.to > p.from);
      res({
        plate: hit ? p!.text : "", plateNorm: hit ? p!.text : "",
        accepted: hit, refuseReason: null,
        meanLogprob: -0.01, minLogprob: -0.01, noSpeechProb: null,
        serverMs: 100, model: null, rawText: hit ? p!.text : "",
      });
    }, lat));
  });
}

interface Ev {
  fatal: string[];
  /** كل نداء `onFatal` بمعاملاته كلها — عشان نثبت إن المسار القديم بمعامل واحد بالحرف */
  fatalArgs: unknown[][];
  /** عدد الطلبات الفاشلة لحظة كل `onFatal` — «عند الفشل الـ٨ بالظبط» */
  fatalAtFailures: number[];
  /** ساعة كل `onFatal` */
  fatalAt: number[];
  weak: boolean[];
  /** ساعة كل `onWeakNet` — عشان نقيس من لحظة دخول الوضع بالظبط */
  weakAt: number[];
  skips: string[]; replays: number; plates: string[];
}

async function boot(extra: Partial<VoicexEngineOpts> & Record<string, unknown> = {}) {
  const ev: Ev = { fatal: [], fatalArgs: [], fatalAtFailures: [], fatalAt: [], weak: [], weakAt: [], skips: [], replays: 0, plates: [] };
  const ctrl = await startVoicexEngine({
    transcribeUrl: "https://x.test/transcribe", token: "t",
    // «الجديد» و«صوتي» الاتنين بيبعتوا `fixes: true`
    fixes: true,
    onPlate: (p) => { ev.plates.push(p); },
    onFatal: (...a: unknown[]) => { ev.fatal.push(a[0] as string); ev.fatalArgs.push(a); ev.fatalAtFailures.push(net.failures); ev.fatalAt.push(Date.now()); },
    onSkip: (r) => { ev.skips.push(r); },
    onReplay: () => { ev.replays += 1; },
    onWeakNet: (w: boolean) => { ev.weak.push(w); ev.weakAt.push(Date.now()); },
    ...extra,
  } as VoicexEngineOpts);
  // المندوب بيتكلّم طول الوقت (اللوحات ورا بعض)
  h.vad?.onSpeechStart?.();
  return { ctrl: ctrl!, ev };
}

const WEAK = { netResilience: true } as const;

/** قدّم الساعة بخطوات ١٠٠ms لحد ما الشرط يتحقّق. */
async function until(pred: () => boolean, maxMs = 180_000) {
  for (let t = 0; t < maxMs && !pred(); t += 100) await vi.advanceTimersByTimeAsync(100);
  expect(pred()).toBe(true);
}

/**
 * `stop()` بيستنى الطلبات الطايرة — ومؤقّتاتها مزيّفة، فلازم نقدّم الساعة
 * لحد ما الوعد يخلص (من غير كده الاختبار بيعلّق).
 */
async function stopNow(ctrl: { stop: () => Promise<void> }) {
  let done = false;
  const p = ctrl.stop().then(() => { done = true; });
  await until(() => done, 120_000);
  await p;
}

/**
 * 🔌 `checkReachable` مزيّف (فحص `/health` بـno-cors في الصفحة): بيرجّع الإجابات
 * بالترتيب والأخيرة بتتكرّر — `"hang"` = مابيرجعش أبداً، `"reject"` = بيرمي.
 * `calls` = ساعة كل نداء.
 */
type ReachAnswer = boolean | "hang" | "reject";
function reachSpy(...answers: ReachAnswer[]) {
  const calls: number[] = [];
  const fn = vi.fn((): Promise<boolean> => {
    calls.push(Date.now());
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a === "hang") return new Promise<boolean>(() => { /* للأبد */ });
    if (a === "reject") return Promise.reject(new Error("boom"));
    return Promise.resolve(a);
  });
  return { fn, calls };
}

/** وعد بنتحكّم في لحظة رجوعه — عشان نختبر «الفحص لسه طاير». */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

// ساعات مزيّفة لحد ٣ دقايق بخطوات ١٠٠ms — أطول من الافتراضي (٥ث حقيقية)
vi.setConfig({ testTimeout: 60_000 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 3, 10, 0, 0));
  resetNet();
  post.mockReset();
  installServer();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("🔒 بلا `netResilience` — سلوك النهارده بالحرف (المناديب و«صوتي»)", () => {
  it("onFatal(\"tunnel_down\") عند الفشل الـ٨ بالظبط — ومش قبله", async () => {
    net.up = false;
    const { ev, ctrl } = await boot({ onWeakNet: undefined });
    await until(() => net.failures >= 7);
    expect(ev.fatal).toEqual([]);
    await until(() => net.failures >= 8);
    expect(ev.fatal).toEqual(["tunnel_down"]);
    await stopNow(ctrl);
  });

  it("وبيتكرّر مع كل فشل بعده — مافيش قفل (زي النهارده)", async () => {
    net.up = false;
    const { ev, ctrl } = await boot({ onWeakNet: undefined });
    await until(() => net.failures >= 10);
    expect(ev.fatal).toEqual(["tunnel_down", "tunnel_down", "tunnel_down"]);
    await stopNow(ctrl);
  });

  it("والإرسال مابيقلّش بعد الفشل الـ٨ — نافذة كل ١.٥ث زي ما هو", async () => {
    net.up = false;
    const { ctrl } = await boot({ onWeakNet: undefined });
    await until(() => net.failures >= 8);
    const n0 = net.sends.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(net.sends.length - n0).toBeGreaterThanOrEqual(39);
    await stopNow(ctrl);
  });

  it("وطلب بيرجع **بعد** stop() لسه بينده onFatal — اتساب زي ما هو عن قصد", async () => {
    net.up = false;
    const { ev, ctrl } = await boot({ onWeakNet: undefined });
    await until(() => net.failures >= 8);
    const before = ev.fatal.length;
    await until(() => net.inflight === 1);
    await stopNow(ctrl);
    expect(ev.fatal.length).toBe(before + 1);
  });

  it("onWeakNet مابيتندهش أبداً من غير العلم", async () => {
    net.up = false;
    const { ev, ctrl } = await boot();
    await until(() => net.failures >= 12);
    expect(ev.weak).toEqual([]);
    await stopNow(ctrl);
  });
});

describe("🐢 بـ`netResilience` — الوضع بيبدأ في الضرورة القصوى بس", () => {
  it("مابيبدأش غير مع الفشل الـ٨ المتتالي — وبدل onFatal مش معاه", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => net.failures >= 7);
    expect(ev.weak).toEqual([]);
    expect(ev.fatal).toEqual([]);
    await until(() => net.failures >= 8);
    expect(ev.weak).toEqual([true]);
    expect(ev.fatal).toEqual([]);
    await stopNow(ctrl);
  });

  it("قبل الفشل الـ٨ مافيش ولا فرق: نفس الطلبات بنفس التوقيت ونفس التخطّيات", async () => {
    // ٧ فشل ورا بعض وبعدين نجاح — مايوصلش ٨ أبداً
    const run = async (extra: Record<string, unknown>) => {
      resetNet();
      net.okFor = (i) => i % 8 === 7;
      const { ev, ctrl } = await boot(extra);
      const t0 = Date.now();
      await vi.advanceTimersByTimeAsync(90_000);
      await stopNow(ctrl);
      return { sends: net.sends.map((t) => t - t0), skips: ev.skips, weak: ev.weak, fatal: ev.fatal };
    };
    const legacy = await run({ onWeakNet: undefined });
    const flagged = await run(WEAK);
    expect(flagged.weak).toEqual([]);
    expect(flagged.fatal).toEqual([]);
    expect(legacy.fatal).toEqual([]);
    expect(flagged.sends).toEqual(legacy.sends);
    expect(flagged.skips).toEqual(legacy.skips);
    expect(legacy.sends.length).toBeGreaterThan(50);
  });

  it("onFatal(\"tunnel_down\") مابيتندهش خالص حتى لو الشبكة واقعة ٣ دقايق — وonWeakNet(true) مرة واحدة", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(ev.fatal).toEqual([]);
    expect(ev.weak).toEqual([true]);
    await stopNow(ctrl);
  });

  it("mic_denied لسه وقوع زي ما هو — مرة واحدة", async () => {
    h.micFails = true;
    const fatal: string[] = [];
    const ctrl = await startVoicexEngine({
      transcribeUrl: "https://x.test/transcribe", token: "t", fixes: true,
      onPlate: () => {}, onFatal: (r) => { fatal.push(r); },
      netResilience: true,
    } as VoicexEngineOpts);
    expect(ctrl).toBeNull();
    expect(fatal).toEqual(["mic_denied"]);
  });
});

describe("🐢 جوّه الوضع الموبايل بيشتغل أقل", () => {
  it("الطلبات بتقلّ: جسّة واحدة على فترات بتطول (٣ ⇐ ٦ ⇐ ١٢ ⇐ سقف ~٢٠ث)", async () => {
    net.up = false;
    const { ctrl } = await boot(WEAK);
    await until(() => net.failures >= 8);
    const t0 = Date.now();
    const n0 = net.sends.length;
    net.maxInflight = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    const probes = net.sends.slice(n0).map((t) => t - t0);
    // النهارده كانوا ~٤٠ طلب في الدقيقة دي
    expect(probes.length).toBeGreaterThanOrEqual(3);
    expect(probes.length).toBeLessThanOrEqual(6);
    // جسّة واحدة بس في المرة
    expect(net.maxInflight).toBeLessThanOrEqual(1);
    // الفترات بتطول، والسقف ~٢٠ث (+ دقّة المؤقّت ١.٥ث + الرحلة)
    const gaps = probes.slice(1).map((t, i) => t - probes[i]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1]);
    expect(probes[0]).toBeGreaterThanOrEqual(3000);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(22_000);
    // ودقيقة كمان: الفترة ثابتة على السقف، مابتكبرش
    const n1 = net.sends.length;
    await vi.advanceTimersByTimeAsync(60_000);
    const more = net.sends.length - n1;
    expect(more).toBeGreaterThanOrEqual(2);
    expect(more).toBeLessThanOrEqual(4);
    await stopNow(ctrl);
  });

  it("قراءات النطق مابتتكوّمش: الطابور نفس سقف ٣، ومابيتبعتش منها حاجة وقت الضعف — و**الأحدث** هو اللي يفضل", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    const n0 = net.sends.length;
    // ٦ نطقات ورا بعض (مدى زمني مختلف لكل واحدة)
    for (let i = 0; i < 6; i++) h.vad!.onUtterance!({ startSec: 2 + i * 1.5, endSec: 3 + i * 1.5 });
    h.vad!.onSpeechStart!();
    expect(ev.skips.filter((r) => r === "utterance_queue_full").length).toBe(3);
    // الإرسال الوحيد المسموح = الجسّة
    await vi.advanceTimersByTimeAsync(1000);
    expect(net.sends.length).toBe(n0);
    // الشبكة رجعت ⇒ اللي في الطابور بيمشي الأول
    net.up = true;
    await until(() => ev.weak.length === 2);
    await vi.advanceTimersByTimeAsync(3000);
    const sentRanges = net.ranges.slice(n0).filter(Boolean).map((r) => r!.from.toFixed(2));
    const fromOf = (i: number) => Math.max(0, 2 + i * 1.5 - 0.15).toFixed(2);
    // 🔴 كان بيحتفظ بأقدم ٣ ويرمي الأحدث — بعد وقعة طويلة الأقدم بيبقى صوته
    // برّه الذاكرة. دلوقتي الأقدم هو اللي يترمى والأحدث يمشي.
    for (let i = 3; i < 6; i++) expect(sentRanges).toContain(fromOf(i));
    for (let i = 0; i < 3; i++) expect(sentRanges).not.toContain(fromOf(i));
    await stopNow(ctrl);
  });

  it("نطق استنى أكتر من نافذة الإعادة (٧٥ث) ⇒ بيتشال (utterance_expired) ومابيتقصّش — مافيش قصّ صوت برّه الذاكرة", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    const e0 = h.mic!.elapsedSec;
    h.vad!.onUtterance!({ startSec: e0 - 1.5, endSec: e0 - 0.5 });
    h.vad!.onSpeechStart!();
    const staleFrom = Math.max(0, e0 - 1.5 - 0.15).toFixed(2);
    // الوقعة بتطول دقيقة ونص كمان — النطق ده بقى أقدم من ٧٥ث
    await vi.advanceTimersByTimeAsync(90_000);
    net.up = true;
    await until(() => ev.weak.length === 2);
    await vi.advanceTimersByTimeAsync(5_000);
    const sentFroms = net.ranges.filter(Boolean).map((r) => r!.from.toFixed(2));
    expect(sentFroms).not.toContain(staleFrom);
    expect(ev.skips).toContain("utterance_expired");
    // كل مقطع اتبعت في الجلسة كلها كان صوته لسه جوّه نافذة الإعادة
    for (const r of net.ranges) {
      if (r) expect(r.at - r.from).toBeLessThanOrEqual(REPLAY_MAX_AGE_SEC);
    }
    await stopNow(ctrl);
  });

  it("🐢 الفترة بتتحسب من **بداية** الجسّة اللي فاتت — مهلة ٩ث مابتمطّش الفجوة لـ~٣٠ث", async () => {
    net.up = false;
    net.latencyMs = 9000;   // كل فشل = مهلة كاملة (زي النت الضعيف بجد، مش فشل فوري)
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    const n0 = net.sends.length;
    await vi.advanceTimersByTimeAsync(150_000);
    const starts = net.sends.slice(n0);
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    expect(gaps.length).toBeGreaterThanOrEqual(5);
    // السقف ٢٠ث + دقّة المؤقّت ١.٥ث — مش ٢٠ + ٩ (المهلة) + ١.٥
    expect(Math.max(...gaps)).toBeLessThanOrEqual(21_500);
    // والسقف لسه محترم: مافيش جسّات أكتر من اللازم
    for (const g of gaps.slice(-2)) expect(g).toBeGreaterThanOrEqual(19_500);
    // جسّة واحدة بس في المرة
    expect(gaps.every((g) => g >= 9000)).toBe(true);
    await stopNow(ctrl);
  });
});

describe("🧭 وضع النت الضعيف **لنت الموبايل بس** — السيرفر/النفق لو رد ⇒ وقوع زي النهارده", () => {
  it("fatalReasonFor — الخريطة صريحة ومتثبّتة", () => {
    const table: Array<[string | null | undefined, string]> = [
      // نت الموبايل (الطلب ماوصلش/مارجعش) ⇒ ده سبب الاستسلام بعد ٣ دقايق بس
      ["timeout", "net_lost"], ["network", "net_lost"], ["no_response", "net_lost"],
      [null, "net_lost"], [undefined, "net_lost"], ["", "net_lost"],
      // التوكن/الصلاحية
      ["http_401", "auth_rejected"], ["http_403", "auth_rejected"], ["bad_token", "auth_rejected"],
      // رد مش مفهوم
      ["bad_json", "bad_reply"], ["bad_shape", "bad_reply"],
      // السيرفر/النفق **رد** ⇒ نت الموبايل شغّال والعطل عند السيرفر
      ["http_429", "server_down"], ["http_500", "server_down"], ["http_501", "server_down"],
      ["http_502", "server_down"], ["http_503", "server_down"], ["http_504", "server_down"],
      ["http_520", "server_down"], ["http_522", "server_down"], ["http_524", "server_down"],
      ["http_525", "server_down"], ["http_530", "server_down"],
      ["http_400", "server_down"], ["http_404", "server_down"], ["http_413", "server_down"],
      // مش معروف بجد ⇒ `tunnel_down` (نفس سبب النهارده)
      ["error", "tunnel_down"], ["حاجة_غريبة", "tunnel_down"], ["http_5", "tunnel_down"],
    ];
    for (const [code, reason] of table) expect([code, fatalReasonFor(code)]).toEqual([code, reason]);
  });

  it("isWeakNetFailure — نت الموبايل بس (مش 429 ولا 5xx ولا 52x)", () => {
    for (const c of ["timeout", "network", "no_response", null, undefined, ""]) expect(isWeakNetFailure(c)).toBe(true);
    for (const c of ["http_429", "http_500", "http_502", "http_503", "http_504", "http_520", "http_530",
      "http_401", "http_403", "http_404", "bad_json", "bad_shape", "bad_token", "error"]) {
      expect([c, isWeakNetFailure(c)]).toEqual([c, false]);
    }
  });

  it.each([["timeout"], ["network"], [null]] as Array<[string | null]>)("%s ⇒ نت ضعيف (مش وقوع)", async (code) => {
    net.up = false; net.code = code;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => net.failures >= 10);
    expect(ev.weak).toEqual([true]);
    expect(ev.fatal).toEqual([]);
    await stopNow(ctrl);
  });

  it.each([
    ["http_429", "server_down"], ["http_500", "server_down"], ["http_501", "server_down"],
    ["http_502", "server_down"], ["http_503", "server_down"], ["http_504", "server_down"],
    ["http_520", "server_down"], ["http_525", "server_down"], ["http_530", "server_down"],
    ["http_400", "server_down"], ["http_404", "server_down"], ["http_413", "server_down"],
    ["http_401", "auth_rejected"], ["http_403", "auth_rejected"],
    ["bad_json", "bad_reply"], ["bad_shape", "bad_reply"],
    ["error", "tunnel_down"],
  ])("%s ⇒ وقوع عند الفشل الـ٨ بالظبط بسبب «%s» — مش نت ضعيف، ومرة واحدة", async (code, reason) => {
    net.up = false; net.code = code;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => net.failures >= 7);
    expect(ev.fatal).toEqual([]);
    await until(() => net.failures >= 8);
    expect(ev.fatalArgs).toEqual([[reason, code]]);
    expect(ev.fatalAtFailures).toEqual([8]);
    expect(ev.weak).toEqual([]);
    // فضل يفشل ⇒ مافيش وقوع تاني ولا نت ضعيف
    await until(() => net.failures >= 12);
    expect(ev.fatal).toEqual([reason]);
    expect(ev.weak).toEqual([]);
    await stopNow(ctrl);
  });

  it.each([["http_530"], ["http_502"], ["http_503"], ["http_429"]])(
    "🔟 ١٠ دقايق %s (النفق/السيرفر واقع والنت شغّال) ⇒ server_down عند الفشل الـ٨ — وعمره ما يبقى «نت ضعيف»",
    async (code) => {
      net.up = false; net.code = code;
      const { ev, ctrl } = await boot(WEAK);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(ev.fatalArgs).toEqual([["server_down", code]]);
      expect(ev.fatalAtFailures).toEqual([8]);
      expect(ev.weak).toEqual([]);
      expect(ev.plates).toEqual([]);
      await stopNow(ctrl);
    },
  );

  it("🔟 ١٠ دقايق من خليط 530/502/503/429 ⇒ server_down مرة واحدة عند الـ٨، ولا «نت ضعيف»", async () => {
    net.up = false;
    const codes = ["http_530", "http_502", "http_503", "http_429"];
    net.codeFor = (i) => codes[i % codes.length];
    const { ev, ctrl } = await boot(WEAK);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(ev.fatal).toEqual(["server_down"]);
    expect(ev.fatalAtFailures).toEqual([8]);
    expect(ev.weak).toEqual([]);
    await stopNow(ctrl);
  });

  /**
   * 🧭 سلسلة مخلوطة (مراجعة ٣ أكتوبر): رد سيرفر **واحد** وسط ٧ فشل نت كان بيطلّع
   * «السيرفر مش بيرد — مش مشكلة النت» — و٥-٧ من الـ٨ كانوا نت الموبايل فعلاً.
   * دلوقتي: التوكن في **أي مكان** في السلسلة يكسب (الإعادة عمرها ما هتحلّه)،
   * وغير كده **الأغلبية**: ≥٥ من الـ٨ نت ⇒ وضع النت الضعيف (والجسّة الجاية هي
   * اللي هتقول لو السيرفر هو الواقع)، أقل ⇒ وقوع بأوضح سبب مش-نت زي الأول.
   */
  describe("سلسلة مخلوطة ⇒ التوكن في أي مكان يكسب، وغير كده الأغلبية من الـ٨", () => {
    const fatalCases: Array<[string, (i: number) => string | null, string, string]> = [
      ["٧ مهلات وبعدين 401 ⇒ التوكن", (i) => (i === 7 ? "http_401" : "timeout"), "auth_rejected", "http_401"],
      ["401 الأول وبعدين ٧ network ⇒ التوكن (حتى والأغلبية نت)", (i) => (i === 0 ? "http_401" : "network"), "auth_rejected", "http_401"],
      ["bad_token وسط ٧ مهلات ⇒ التوكن", (i) => (i === 3 ? "bad_token" : "timeout"), "auth_rejected", "bad_token"],
      ["503 و401 في نفس السلسلة ⇒ التوكن الأول (الإعادة مش هتحلّه)",
        (i) => (i === 1 ? "http_401" : i === 4 ? "http_503" : "timeout"), "auth_rejected", "http_401"],
      ["٣ نت + ٥ http_503 ⇒ server_down", (i) => (i < 3 ? "network" : "http_503"), "server_down", "http_503"],
      ["٤ نت + ٤ http_502 (مش أغلبية) ⇒ server_down", (i) => (i % 2 === 0 ? "timeout" : "http_502"), "server_down", "http_502"],
      ["٣ مهلات + ٥ bad_json ⇒ رد مش مفهوم", (i) => (i < 3 ? "timeout" : "bad_json"), "bad_reply", "bad_json"],
      ["٣ مهلات + ٥ error ⇒ مش معروف", (i) => (i < 3 ? "timeout" : "error"), "tunnel_down", "error"],
      ["٢ نت + bad_json + ٥ http_502 ⇒ أوضح سبب: السيرفر",
        (i) => (i < 2 ? "network" : i === 2 ? "bad_json" : "http_502"), "server_down", "http_502"],
      ["٤ مهلات + 503 ثم 504 ⇒ آخر كود سيرفر",
        (i) => (i < 4 ? "timeout" : i < 6 ? "http_503" : "http_504"), "server_down", "http_504"],
      ["٨ http_503 (صفر نت) ⇒ server_down زي ما هو", () => "http_503", "server_down", "http_503"],
    ];
    it.each(fatalCases)("%s", async (_name, codeFor, reason, code) => {
      net.up = false;
      net.codeFor = codeFor;
      const { ev, ctrl } = await boot(WEAK);
      await until(() => net.failures >= 8);
      expect(ev.fatalArgs).toEqual([[reason, code]]);
      expect(ev.fatalAtFailures).toEqual([8]);
      expect(ev.weak).toEqual([]);
      await stopNow(ctrl);
    });

    const weakCases: Array<[string, (i: number) => string | null]> = [
      ["٦ مهلات + ٢ http_503 ⇒ نت ضعيف", (i) => (i === 2 || i === 5 ? "http_503" : "timeout")],
      ["٥ مهلات + ٣ http_503 (الحد) ⇒ نت ضعيف", (i) => (i < 3 ? "http_503" : "timeout")],
      ["٧ مهلات وبعدين 503 ⇒ نت ضعيف (الأغلبية نت — والجسّة الجاية هي اللي تقول)", (i) => (i === 7 ? "http_503" : "timeout")],
      ["502 الأول وبعدين ٧ مهلات ⇒ نت ضعيف", (i) => (i === 0 ? "http_502" : "timeout")],
      ["404 الأول وبعدين مهلات ⇒ نت ضعيف", (i) => (i === 0 ? "http_404" : "timeout")],
      ["bad_json وسط ٧ مهلات ⇒ نت ضعيف", (i) => (i === 3 ? "bad_json" : "timeout")],
      ["error وسط ٧ مهلات ⇒ نت ضعيف", (i) => (i === 3 ? "error" : "timeout")],
      ["bad_json و502 وسط ٦ مهلات ⇒ نت ضعيف", (i) => (i === 2 ? "bad_json" : i === 5 ? "http_502" : "timeout")],
    ];
    it.each(weakCases)("%s — والأقلية مابتوقّعش الوضع بعدين (الجسّات نت)", async (_name, codeFor) => {
      net.up = false;
      // بعد الـ٨: مهلات بس (نت الموبايل لسه ضعيف)
      net.codeFor = (i) => (i < 8 ? codeFor(i) : "timeout");
      const { ev, ctrl } = await boot(WEAK);
      await until(() => net.failures >= 8);
      expect(ev.weak).toEqual([true]);
      expect(ev.fatal).toEqual([]);
      // 🔴 قبل كده أي فشل بعد الـ٨ كان بيوقّع بسبب الأقلية — دلوقتي الجسّة نت ⇒ ضعيف
      await until(() => net.failures >= 14, 120_000);
      expect(ev.fatal).toEqual([]);
      expect(ev.weak).toEqual([true]);
      await stopNow(ctrl);
    });

    it("٦ مهلات + ٢ http_503 ⇒ ضعيف، وجسّة رجعت 503 ⇒ server_down (السيرفر هو الواقع فعلاً)", async () => {
      net.up = false;
      net.codeFor = (i) => (i === 2 || i === 5 ? "http_503" : i < 8 ? "timeout" : "http_503");
      const { ev, ctrl } = await boot(WEAK);
      await until(() => ev.weak.length === 1);
      await until(() => ev.fatal.length === 1, 30_000);
      expect(ev.fatalArgs).toEqual([["server_down", "http_503"]]);
      await stopNow(ctrl);
    });
  });

  it("رد ناجح بيصفّر السلسلة: 404 ثم نجاح ثم ٨ مهلات ⇒ نت ضعيف عادي", async () => {
    net.up = false;
    net.okFor = (i) => i === 1;
    net.codeFor = (i) => (i === 0 ? "http_404" : "timeout");
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    expect(ev.fatal).toEqual([]);
    await stopNow(ctrl);
  });

  it("وهو ضعيف: جسّة رجعت 401 ⇒ وقوع auth_rejected مرة واحدة (التوكن اتلغى وسط الوقعة)", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    net.code = "http_401";
    await until(() => ev.fatal.length === 1, 60_000);
    expect(ev.fatalArgs).toEqual([["auth_rejected", "http_401"]]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ev.fatal.length).toBe(1);
    await stopNow(ctrl);
  });

  it("وهو ضعيف: جسّة رجعت 503 ⇒ نت الموبايل رجع والسيرفر هو الواقع ⇒ server_down مرة واحدة", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    net.code = "http_503";
    await until(() => ev.fatal.length === 1, 60_000);
    expect(ev.fatalArgs).toEqual([["server_down", "http_503"]]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ev.fatal.length).toBe(1);
    expect(ev.weak).toEqual([true]);
    await stopNow(ctrl);
  });

  it("وقع وهو ضعيف والصفحة ماقفلتش ⇒ الجسّات بتقف خالص (حتى بعد ما الـ٣ دقايق تعدّي)", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await vi.advanceTimersByTimeAsync(WEAK_NET_GIVE_UP_MS - 30_000);
    net.code = "http_503";
    await until(() => ev.fatal.length === 1, 60_000);
    await until(() => net.inflight === 0, 10_000);
    const n = net.sends.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(net.sends.length).toBe(n);
    expect(ev.fatalArgs).toEqual([["server_down", "http_503"]]);
    await stopNow(ctrl);
  });

  it("وهو ضعيف وساكت: جسّة الإعادة رجعت 401 ⇒ برضه وقوع (الجسّة بتتعدّ حتى لو إعادة)", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    // المندوب سكت ⇒ الجسّة بقت أقدم نافذة فايتة (إعادة)
    const e0 = h.mic!.elapsedSec;
    h.vad!.onUtterance!({ startSec: e0 - 0.4, endSec: e0 - 0.2 });   // قصيرة ⇒ مابتتحطّش في الطابور
    await vi.advanceTimersByTimeAsync(10_000);
    net.code = "http_401";
    await until(() => ev.fatal.length === 1, 60_000);
    expect(ev.fatalArgs).toEqual([["auth_rejected", "http_401"]]);
    await stopNow(ctrl);
  });

  it("🔒 بلا العلم: أي كود ⇒ onFatal(\"tunnel_down\") **بمعامل واحد** ومع كل فشل — زي النهارده بالحرف", async () => {
    for (const code of ["http_401", "bad_json", "timeout", null, "http_503", "http_429", "http_530", "network"]) {
      resetNet();
      net.up = false; net.code = code;
      const { ev, ctrl } = await boot({ onWeakNet: undefined });
      await until(() => net.failures >= 9);
      expect(ev.fatalArgs).toEqual([["tunnel_down"], ["tunnel_down"]]);
      expect(ev.weak).toEqual([]);
      await stopNow(ctrl);
    }
  });
});

describe("🐢 الشبكة رجعت ⇒ خروج من الوضع + اللوحات اللي اتقالت وقت الوقعة بتظهر", () => {
  it("أول رد ناجح: onWeakNet(false) مرة، والفايت بيتبعت تاني (محدود)، والإرسال العادي بيرجع", async () => {
    net.up = false;
    // المندوب قال لوحة وسط الوقعة (ثانية ٣٠–٣٢ من الصوت)
    net.plate = { from: 30, to: 32, text: "ابح1234" };
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await vi.advanceTimersByTimeAsync(45_000 - 12_400);
    expect(ev.plates).toEqual([]);
    net.up = true;
    await until(() => ev.weak.length === 2, 60_000);
    expect(ev.weak).toEqual([true, false]);
    expect(ev.fatal).toEqual([]);
    await until(() => ev.plates.includes("ابح1234"), 60_000);
    expect(ev.replays).toBeGreaterThan(0);
    expect(ev.replays).toBeLessThanOrEqual(MISSED_CAP);
    // الإرسال العادي رجع: نافذة كل ١.٥ث تقريباً (+ أي إعادة لسه بتصرّف)
    const n0 = net.sends.length;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(net.sends.length - n0).toBeGreaterThanOrEqual(9);
    await stopNow(ctrl);
  });

  it("بعد الخروج، الرجوع للوضع محتاج ٨ فشل متتالي من جديد", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    net.up = true;
    await until(() => ev.weak.length === 2);
    // نسيب الإعادة تخلص الأول: فشل **الإعادة** مابيتعدّش في الـ٨ (عن قصد،
    // `sendWav`)، والسيرفر المزيّف بيعدّ كل فشل — فلو قطعنا والإعادة شغّالة
    // العدّ هنا هيبقى غلط مش المحرّك.
    await vi.advanceTimersByTimeAsync(40_000);
    const f0 = net.failures;
    net.up = false;
    await until(() => net.failures >= f0 + 7);
    expect(ev.weak).toEqual([true, false]);
    await until(() => net.failures >= f0 + 8);
    expect(ev.weak).toEqual([true, false, true]);
    await stopNow(ctrl);
  });
});

describe("🐢 مافيش أي نداء بعد stop()", () => {
  it("الفشل الـ٨ لو رجع بعد الإيقاف مابيدخّلش الوضع ولا بيوقّع", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => net.failures >= 7);
    await until(() => net.inflight === 1);
    await stopNow(ctrl);
    expect(net.failures).toBeGreaterThanOrEqual(8);
    expect(ev.weak).toEqual([]);
    expect(ev.fatal).toEqual([]);
  });

  it("جسّة نجحت بعد الإيقاف مابتندهش onWeakNet(false)", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await until(() => net.inflight === 1);   // الجسّة طايرة
    net.up = true;
    await stopNow(ctrl);
    expect(ev.weak).toEqual([true]);
    expect(ev.fatal).toEqual([]);
  });

  it("وقت الضعف بعد الإيقاف: مافيش جسّات تانية", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await until(() => net.inflight === 0);
    await stopNow(ctrl);
    const n0 = net.sends.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(net.sends.length).toBe(n0);
    expect(ev.weak).toEqual([true]);
    expect(ev.fatal).toEqual([]);
  });
});

describe("⏱️ ٣ دقايق وضع ضعيف من غير ولا رد ناجح ⇒ net_lost (الصفحة بتقفل التسجيل)", () => {
  it("WEAK_NET_GIVE_UP_MS = ١٨٠ث — أطول من نافذة الإعادة (٧٥ث) بكتير", () => {
    expect(WEAK_NET_GIVE_UP_MS).toBe(180_000);
    expect(WEAK_NET_GIVE_UP_MS).toBeGreaterThan(REPLAY_MAX_AGE_SEC * 1000 * 2);
  });

  it("🔌 ١٥ دقيقة `network` والمندوب بيتكلّم ⇒ ضعيف، وبعد ١٨٠ث ⇒ net_lost مرة واحدة — بلا لوحات مخترعة وعدد الطلبات محدود", async () => {
    net.up = false; net.code = "network";
    // المندوب قال لوحة — بس السيرفر عمره ما رد، فمفيش لوحة تظهر
    net.plate = { from: 20, to: 22, text: "ابح1234" };
    const t0 = Date.now();
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    const tWeak = Date.now();
    const sendsAtWeak = net.sends.length;
    await until(() => ev.fatal.length === 1, WEAK_NET_GIVE_UP_MS + 10_000);
    const waited = Date.now() - tWeak;
    // ~١٨٠ث من دخول الوضع: + جسّة قديمة لسه طايرة عند الحد (مابتستسلمش — ⑦)
    // + دقّة المؤقّت (١.٥ث) + رحلة الجسّة اللي بدأت بعد الحد
    expect(waited).toBeGreaterThanOrEqual(WEAK_NET_GIVE_UP_MS);
    expect(waited).toBeLessThanOrEqual(WEAK_NET_GIVE_UP_MS + net.latencyMs + 1500 + net.latencyMs + 200);
    expect(ev.fatalArgs).toEqual([["net_lost", "network"]]);
    // ١٨٠ث كلها = جسّات بس (٣ · ٦ · ١٢ · ٢٠ث سقف) + آخر جسّة
    expect(net.sends.length - sendsAtWeak).toBeLessThanOrEqual(13);
    const sendsAtFatal = net.sends.length;
    // باقي الربع ساعة: ولا طلب (حتى لو الصفحة ماقفلتش)
    await vi.advanceTimersByTimeAsync(15 * 60_000 - (Date.now() - t0));
    expect(net.sends.length).toBe(sendsAtFatal);
    expect(net.sends.length).toBeLessThanOrEqual(25);
    expect(ev.fatal).toEqual(["net_lost"]);
    expect(ev.weak).toEqual([true]);
    expect(ev.plates).toEqual([]);
    // والإيقاف بعدها فوري وبلا ولا طلب
    let done = false;
    const p = ctrl.stop().then(() => { done = true; });
    await until(() => done, 200);
    await p;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(net.sends.length).toBe(sendsAtFatal);
    expect(ev.plates).toEqual([]);
  });

  it("الصفحة بتقفل على net_lost (زي «الجديد») ⇒ الإيقاف فوري، ومافيش ولا طلب بعده", async () => {
    net.up = false; net.code = "network";
    let ctrlRef: { stop: () => Promise<void> } | null = null;
    let stopDone = false;
    let fatalAt = 0;
    const fatals: unknown[][] = [];
    const { ctrl } = await boot({
      ...WEAK,
      onFatal: (...a: unknown[]) => {
        fatals.push(a);
        fatalAt = Date.now();
        void ctrlRef?.stop().then(() => { stopDone = true; });
      },
    });
    ctrlRef = ctrl;
    await until(() => fatals.length === 1, WEAK_NET_GIVE_UP_MS + 30_000);
    const n = net.sends.length;
    await until(() => stopDone, 200);
    expect(Date.now() - fatalAt).toBeLessThanOrEqual(200);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(net.sends.length).toBe(n);
    expect(fatals).toEqual([["net_lost", "network"]]);
  });

  it("مهلات حقيقية (٩ث) ⇒ net_lost بعد ١٨٠ث + جسّة قديمة طايرة + آخر جسّة بالكتير، بالكود الحقيقي", async () => {
    net.up = false; net.code = "timeout"; net.latencyMs = 9000;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1, 120_000);
    const tWeak = ev.weakAt[0];
    await until(() => ev.fatal.length === 1, WEAK_NET_GIVE_UP_MS + 40_000);
    const waited = ev.fatalAt[0] - tWeak;
    expect(waited).toBeGreaterThanOrEqual(WEAK_NET_GIVE_UP_MS);
    // جسّة بدأت قبل الحد وخلصت بعده (٩ث) ⇒ جسّة جديدة على أول دقّة (١.٥ث) وفشلها (٩ث)
    expect(waited).toBeLessThanOrEqual(WEAK_NET_GIVE_UP_MS + 9000 + 1500 + 9000 + 200);
    expect(ev.fatalArgs).toEqual([["net_lost", "timeout"]]);
    await stopNow(ctrl);
  });

  it("🔁 الشبكة رجعت جوّه الـ١٨٠ث ⇒ مافيش net_lost، والفايت بيرجع واللوحة اللي اتقالت وقت الوقعة بتظهر", async () => {
    net.up = false;
    const t0 = Date.now();
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    const tWeak = Date.now();
    // المندوب قال لوحة بعد ١٥٠ث من بداية الوضع
    const sec = (tWeak - t0) / 1000 + 150;
    net.plate = { from: sec, to: sec + 2, text: "ابح1234" };
    await vi.advanceTimersByTimeAsync(170_000);
    expect(ev.fatal).toEqual([]);
    net.up = true;
    // آخر جسّة قبل الاستسلام بتكشف الرجوع (حتى لو ميعاد الجسّة العادية بعد الـ١٨٠ث)
    await until(() => ev.weak.length === 2, 15_000);
    expect(Date.now() - tWeak).toBeLessThanOrEqual(WEAK_NET_GIVE_UP_MS + 1500 + net.latencyMs + 200);
    expect(ev.weak).toEqual([true, false]);
    await until(() => ev.plates.includes("ابح1234"), 60_000);
    expect(ev.replays).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(ev.fatal).toEqual([]);
    await stopNow(ctrl);
  });

  it("رجوع ثم وقعة تانية ⇒ عدّاد الـ١٨٠ث بيبدأ من جديد (مش من أول وقعة)", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await vi.advanceTimersByTimeAsync(100_000);
    net.up = true;
    await until(() => ev.weak.length === 2, 30_000);
    await vi.advanceTimersByTimeAsync(40_000);
    net.up = false;
    await until(() => ev.weak.length === 3, 60_000);
    const tWeak2 = Date.now();
    await until(() => ev.fatal.length === 1, WEAK_NET_GIVE_UP_MS + 10_000);
    expect(Date.now() - tWeak2).toBeGreaterThanOrEqual(WEAK_NET_GIVE_UP_MS);
    expect(ev.fatal).toEqual(["net_lost"]);
    await stopNow(ctrl);
  });

  it("ساكت ومفيش صوت يتجسّ بيه ⇒ مابيستسلمش من غير دليل؛ أول ما يتكلّم والجسّة تفشل ⇒ net_lost على طول", async () => {
    net.up = false; net.code = "network";
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    const tWeak = Date.now();
    // سكت (نطق قصير ⇒ مابيتحطّش في الطابور) — الفايت بيعدّي عليه ٧٥ث ويتشال
    const e0 = h.mic!.elapsedSec;
    h.vad!.onUtterance!({ startSec: e0 - 0.4, endSec: e0 - 0.2 });
    await vi.advanceTimersByTimeAsync(WEAK_NET_GIVE_UP_MS + 40_000);
    expect(ev.fatal).toEqual([]);
    const n = net.sends.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.sends.length).toBe(n);   // ولا طلب وهو ساكت
    // اتكلّم ⇒ الجسّة فورية (فات ميعاد الاستسلام) وفشلها = net_lost
    h.vad!.onSpeechStart!();
    const tTalk = Date.now();
    await until(() => ev.fatal.length === 1, 5_000);
    expect(Date.now() - tTalk).toBeLessThanOrEqual(1500 + net.latencyMs + 200);
    expect(Date.now() - tWeak).toBeGreaterThan(WEAK_NET_GIVE_UP_MS);
    expect(ev.fatalArgs).toEqual([["net_lost", "network"]]);
    await stopNow(ctrl);
  });

  it("الإيقاف قبل الـ١٨٠ث ⇒ عمره ما يتنده net_lost", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await vi.advanceTimersByTimeAsync(100_000);
    await stopNow(ctrl);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(ev.fatal).toEqual([]);
  });

  it("🔒 بلا العلم مافيش استسلام بالوقت — tunnel_down مع كل فشل زي النهارده", async () => {
    net.up = false; net.code = "network";
    const { ev, ctrl } = await boot({ onWeakNet: undefined });
    await vi.advanceTimersByTimeAsync(WEAK_NET_GIVE_UP_MS + 30_000);
    expect(ev.fatal.length).toBeGreaterThan(100);
    expect(new Set(ev.fatal)).toEqual(new Set(["tunnel_down"]));
    expect(ev.fatalArgs.every((a) => a.length === 1)).toBe(true);
    await stopNow(ctrl);
  });
});

describe("⏹️ الإيقاف بعد وضع النت الضعيف خفيف — ميزانية محدودة، والأحدث الأول", () => {
  it("الثوابت: ميزانية = مهلة الصفحة (١٥ث)، وسقف إعادات معقول", () => {
    expect(NET_STOP_BUDGET_MS).toBe(15_000);
    expect(NET_STOP_MAX_REPLAYS).toBeGreaterThanOrEqual(8);
    expect(NET_STOP_MAX_REPLAYS).toBeLessThanOrEqual(20);
  });

  /** ضعيف دقيقة والمندوب بيتكلّم، وجسّة طايرة، والشبكة ترجع لحظة الإيقاف. */
  async function weakThenStopWhileProbing(latencyAfter: number) {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await vi.advanceTimersByTimeAsync(60_000);
    await until(() => net.inflight === 1, 30_000);   // الجسّة طايرة
    net.up = true;
    net.latencyMs = latencyAfter;
    const n0 = net.sends.length;
    const tStop = Date.now();
    const audioAtStop = h.mic!.elapsedSec;
    let done = false;
    const p = ctrl.stop().then(() => { done = true; });
    await until(() => done, NET_STOP_BUDGET_MS + 2_000);
    await p;
    const took = Date.now() - tStop;
    const nDone = net.sends.length;
    const afterStop = net.ranges.slice(n0).map((r) => r!);
    const sendTimes = net.sends.slice(n0).map((t) => t - tStop);
    await vi.advanceTimersByTimeAsync(120_000);
    return { ev, took, afterStop, sendTimes, nDone, audioAtStop };
  }

  it("الشبكة رجعت لحظة الإيقاف ⇒ ≤ سقف الإعادات، الأحدث الأول، وبيخلص في الميزانية — ومافيش ولا طلب بعده (كان ٤٧ طلب و٥٥ث)", async () => {
    const r = await weakThenStopWhileProbing(400);
    expect(r.took).toBeLessThanOrEqual(NET_STOP_BUDGET_MS + 100);
    expect(r.afterStop.length).toBeGreaterThan(0);
    expect(r.afterStop.length).toBeLessThanOrEqual(NET_STOP_MAX_REPLAYS);
    const froms = r.afterStop.map((w) => w.from);
    expect(froms).toEqual([...froms].sort((a, b) => b - a));   // الأحدث الأول
    // أول إعادة = آخر صوت قبل الإيقاف (آخر لوحات اتقالت) — بفرق دقّتين مؤقّت بالكتير
    expect(r.afterStop[0].to).toBeGreaterThanOrEqual(r.audioAtStop - 3.1);
    expect(net.sends.length).toBe(r.nDone);
    expect(r.ev.weak).toEqual([true]);
    expect(r.ev.fatal).toEqual([]);
  });

  it("شبكة بطيئة لحظة الإيقاف (٣ث للطلب) ⇒ الإيقاف بيخلص على الميزانية، ومافيش طلب بيبدأ بعدها", async () => {
    const r = await weakThenStopWhileProbing(3000);
    expect(r.took).toBeLessThanOrEqual(NET_STOP_BUDGET_MS + 100);
    expect(r.sendTimes.every((t) => t < NET_STOP_BUDGET_MS)).toBe(true);
    expect(r.afterStop.length).toBeLessThanOrEqual(NET_STOP_MAX_REPLAYS);
    expect(net.sends.length).toBe(r.nDone);
  });

  it("الشبكة لسه واقعة لحظة الإيقاف ⇒ الإيقاف مابيبعتش إعادات خالص وبيخلص في الميزانية", async () => {
    net.up = false;
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    await vi.advanceTimersByTimeAsync(60_000);
    const n0 = net.sends.length;
    const tStop = Date.now();
    await stopNow(ctrl);
    expect(Date.now() - tStop).toBeLessThanOrEqual(NET_STOP_BUDGET_MS + 100);
    expect(net.sends.length).toBe(n0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(net.sends.length).toBe(n0);
  });

  it("🔒 بلا العلم: الإيقاف بيصرّف **كل** الفايت زي النهارده (الأقدم الأول، أكتر من سقف العلم)", async () => {
    net.up = false;
    const { ctrl } = await boot({ onWeakNet: undefined });
    await vi.advanceTimersByTimeAsync(60_000);
    await until(() => net.inflight >= 1, 30_000);
    net.up = true;
    const n0 = net.sends.length;
    await stopNow(ctrl);
    const after = net.ranges.slice(n0).map((w) => w!);
    expect(after.length).toBeGreaterThan(NET_STOP_MAX_REPLAYS);
    expect(after[0].from).toBeLessThan(after[after.length - 1].from);   // الأقدم الأول
  });
});

describe("⏱️ ⑦ الاستسلام بدليل من جسّة **بدأت** بعد الـ١٨٠ث بس", () => {
  /**
   * مراجعة ٣ أكتوبر: جسّة اتبعتت عند +١٧٨.٥ث وفشلت بالمهلة عند +١٨٧.٥ث كانت
   * بتستسلم — والنت كان رجع عند +١٧٩ث. المندوب شاف «النت مقطوع» بعد ٨ث من
   * رجوعه، و١٩ لوحة من آخر ٧٥ث ماتعادتش. دلوقتي الجسّة القديمة دي بتبعت جسّة
   * جديدة على طول، والاستسلام من فشل جسّة بدأت بعد الحد بس.
   */
  it.each([[172_000], [175_000], [177_000], [179_000], [179_500], [179_900]])(
    "مهلات ٩ث والنت رجع عند ضعيف+%dms ⇒ رجوع، ولا net_lost، واللوحة اللي اتقالت قبلها بتظهر",
    async (offs) => {
      net.up = false; net.code = "timeout";
      let back = Infinity;
      // زي الموبايل بجد: الطلب اللي خرج والنت واقع مابيرجعش (مهلة ٩ث) حتى لو النت
      // رجع وهو طاير — واللي بيخرج بعد الرجوع بيرد بسرعة. والوضع بيبدأ بين دقّتين
      // (رد رجع بعد ٩.٧ث) ⇒ فيه جسّة بتطلع عند +١٧٩.٣ث وبتفشل بعد الحد.
      net.okFor = (i) => net.sends[i] >= back;
      net.latencyFor = (i) => (net.sends[i] >= back ? 400 : i < 8 ? 9700 : 9000);
      const { ev, ctrl } = await boot(WEAK);
      await until(() => ev.weak.length === 1, 120_000);
      const tWeak = ev.weakAt[0];
      back = tWeak + offs;
      // المندوب قال لوحة قبل رجوع النت بـ١٠ث (لسه جوّه الـ٧٥ث)
      const sec = h.mic!.elapsedSec + (back - Date.now()) / 1000 - 10;
      net.plate = { from: sec, to: sec + 2, text: "ابح1234" };
      await until(() => ev.weak.length === 2 || ev.fatal.length > 0, WEAK_NET_GIVE_UP_MS + 40_000);
      expect(ev.fatal).toEqual([]);
      expect(ev.weak).toEqual([true, false]);
      await until(() => ev.plates.includes("ابح1234"), 60_000);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ev.fatal).toEqual([]);
      await stopNow(ctrl);
    },
  );

  it("🔴 السيناريو بالظبط: جسّة بدأت قبل الحد وفشلت بعده ⇒ مابتستسلمش، وجسّة جديدة بتطلع على طول", async () => {
    net.up = false; net.code = "timeout";
    // الوضع بيبدأ بين دقّتين مؤقّت (رد رجع بعد ٩.٧ث) ⇒ جسّة بتطلع قبل الحد بشوية
    // وبتخلص (مهلة ٩ث) بعده — بالظبط سيناريو المراجعة
    net.latencyFor = (i) => (i < 8 ? 9700 : 9000);
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1, 120_000);
    const tWeak = ev.weakAt[0];
    const deadline = tWeak + WEAK_NET_GIVE_UP_MS;
    await until(() => ev.fatal.length === 1, WEAK_NET_GIVE_UP_MS + 40_000);
    const fatalAt = ev.fatalAt[0];
    const before = net.sends.filter((s) => s <= fatalAt);
    // فيه جسّة اتبعتت قبل الحد ورجعت (فشل) بعده — ودي ماوقّعتش
    const straddle = before.find((s) => s < deadline && s + 9000 > deadline);
    expect(straddle).toBeDefined();
    // اللي وقّع = فشل جسّة **بدأت** بعد الحد، وطلعت على أول دقّة بعد فشل القديمة
    const last = before[before.length - 1];
    expect(last).toBeGreaterThanOrEqual(deadline);
    expect(last - (straddle! + 9000)).toBeLessThanOrEqual(1500 + 100);
    expect(fatalAt - last).toBeGreaterThanOrEqual(9000);
    expect(ev.fatalArgs).toEqual([["net_lost", "timeout"]]);
    await stopNow(ctrl);
  });

  it("network سريع: نفس القاعدة — الاستسلام من جسّة بدأت بعد الحد", async () => {
    net.up = false; net.code = "network";
    const { ev, ctrl } = await boot(WEAK);
    await until(() => ev.weak.length === 1);
    const deadline = ev.weakAt[0] + WEAK_NET_GIVE_UP_MS;
    await until(() => ev.fatal.length === 1, WEAK_NET_GIVE_UP_MS + 30_000);
    const before = net.sends.filter((s) => s <= ev.fatalAt[0]);
    expect(before[before.length - 1]).toBeGreaterThanOrEqual(deadline);
    expect(ev.fatalArgs).toEqual([["net_lost", "network"]]);
    await stopNow(ctrl);
  });
});

describe("🔌 ⑥ نفق ميت ولا نت الموبايل؟ (`checkReachable` — فحص `/health` no-cors)", () => {
  /**
   * نفق Cloudflare ميت/سيرفر واقع بيرجّع صفحة ٥٣٠/٥٠٢ **من غير CORS** ⇒ المتصفّح
   * بيشوفها `network` بالظبط زي موبايل أوفلاين. الفرق: طلب no-cors لـ`/health`
   * بيوصل (رد opaque) لو نت الموبايل شغّال. واصل + الجسّة لسه `network` ⇒ النفق
   * هو الواقع ⇒ `server_down`/`tunnel_error` في ثواني (مش «النت ضعيف» ٣ دقايق).
   */
  it("📵 موبايل أوفلاين (network + الفحص مش واصل) ⇒ ضعيف، وعند الـ١٨٠ث net_lost — والفحص لسه false", async () => {
    net.up = false; net.code = "network";
    const r = reachSpy(false);
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
    await until(() => ev.weak.length === 1);
    const tWeak = ev.weakAt[0];
    // الفحص بيتعمل لحظة دخول الوضع (السلسلة فيها network)
    expect(r.calls).toEqual([tWeak]);
    await vi.advanceTimersByTimeAsync(WEAK_NET_GIVE_UP_MS - 10_000);
    expect(ev.fatal).toEqual([]);
    expect(ev.weak).toEqual([true]);
    await until(() => ev.fatal.length === 1, 40_000);
    expect(ev.fatalArgs).toEqual([["net_lost", "network"]]);
    expect(ev.fatalAt[0] - tWeak).toBeGreaterThanOrEqual(WEAK_NET_GIVE_UP_MS);
    // وفحص تاني عند الاستسلام نفسه — ولسه مش واصل
    expect(r.calls.length).toBe(2);
    expect(r.calls[1] - tWeak).toBeGreaterThanOrEqual(WEAK_NET_GIVE_UP_MS);
    expect(ev.weak).toEqual([true]);
    await stopNow(ctrl);
  });

  it("🚇 نفق واقع (network + الفحص واصل) ⇒ server_down «tunnel_error» خلال ~١٥ث من الفشل الـ٨ — مش ٣ دقايق", async () => {
    net.up = false; net.code = "network";
    const r = reachSpy(true);
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
    await until(() => net.failures >= 8);
    const t8 = Date.now();
    await until(() => ev.fatal.length === 1, 30_000);
    expect(ev.fatalAt[0] - t8).toBeLessThanOrEqual(15_000);
    expect(ev.fatalArgs).toEqual([["server_down", "tunnel_error"]]);
    expect(ev.weak).toEqual([true]);
    // الصفحة ماقفلتش ⇒ برضه ولا طلب بعد الوقوع، ولا وقوع تاني
    await until(() => net.inflight === 0, 10_000);
    const n = net.sends.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(net.sends.length).toBe(n);
    expect(ev.fatal.length).toBe(1);
    expect(ev.plates).toEqual([]);
    await stopNow(ctrl);
  });

  it("🚇 نفق واقع بشبكة بطيئة (network بعد ٣ث للطلب) ⇒ برضه tunnel_error جوّه ~١٥ث", async () => {
    net.up = false; net.code = "network"; net.latencyMs = 3000;
    const r = reachSpy(true);
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
    await until(() => net.failures >= 8, 120_000);
    const t8 = Date.now();
    await until(() => ev.fatal.length === 1, 30_000);
    expect(ev.fatalAt[0] - t8).toBeLessThanOrEqual(15_000);
    expect(ev.fatalArgs).toEqual([["server_down", "tunnel_error"]]);
    await stopNow(ctrl);
  });

  it.each([["timeout", 9000], [null, 400]] as Array<[string | null, number]>)(
    "🐢 رفع بطيء (%s بس) + الفحص واصل ⇒ فاضل ضعيف؛ الفحص عمره ما بيتنده — والاستسلام net_lost زي ما هو",
    async (code, lat) => {
      net.up = false; net.code = code; net.latencyMs = lat;
      const r = reachSpy(true);
      const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
      await until(() => ev.weak.length === 1, 120_000);
      await vi.advanceTimersByTimeAsync(WEAK_NET_GIVE_UP_MS - 5_000);
      expect(ev.fatal).toEqual([]);
      expect(ev.weak).toEqual([true]);
      expect(r.fn).not.toHaveBeenCalled();
      await until(() => ev.fatal.length === 1, 60_000);
      expect(ev.fatalArgs).toEqual([["net_lost", code ?? "no_response"]]);
      expect(r.fn).not.toHaveBeenCalled();
      await stopNow(ctrl);
    },
  );

  it("الفحص واصل والشبكة رجعت ⇒ الجسّة الفورية نجحت ⇒ خروج عادي من الوضع، ولا وقوع", async () => {
    net.up = false; net.code = "network";
    let tReach = 0;
    const fn = vi.fn(async () => {
      tReach = Date.now();
      // نت الموبايل رجع: أي طلب يخرج من دلوقتي ينجح
      net.okFor = (i) => net.sends[i] >= tReach;
      return true;
    });
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: fn });
    await until(() => ev.weak.length === 2 || ev.fatal.length > 0, 30_000);
    expect(ev.fatal).toEqual([]);
    expect(ev.weak).toEqual([true, false]);
    // الجسّة **فورية** (مش ميعاد الـ٣ث العادي) — على أول دقّة مؤقّت + رحلتها
    expect(ev.weakAt[1] - ev.weakAt[0]).toBeLessThanOrEqual(1500 + net.latencyMs + 200);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ev.fatal).toEqual([]);
    await stopNow(ctrl);
  });

  it("الفحص واصل بس الجسّة رجعت مهلة (timeout) ⇒ مش دليل نفق ⇒ فاضل ضعيف، والشك بيتشال (network بعدها مايوقّعش)", async () => {
    net.up = false;
    // الـ٨ network، بعدهم مهلات شوية، وبعدين network تاني
    net.codeFor = (i) => (i < 8 ? "network" : i < 13 ? "timeout" : "network");
    const r = reachSpy(true);
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
    await until(() => ev.weak.length === 1);
    await vi.advanceTimersByTimeAsync(150_000);
    expect(net.failures).toBeGreaterThan(14);
    expect(ev.fatal).toEqual([]);
    expect(ev.weak).toEqual([true]);
    expect(r.calls.length).toBe(1);
    await stopNow(ctrl);
  });

  it("الجسّة رجعت network بس الفحص التاني قال مش واصل (النت وقع تاني) ⇒ نت الموبايل ⇒ فاضل ضعيف، ولا وقوع", async () => {
    net.up = false; net.code = "network";
    const r = reachSpy(true, false);
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
    await until(() => r.calls.length === 2, 30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ev.fatal).toEqual([]);
    expect(ev.weak).toEqual([true]);
    await stopNow(ctrl);
  });

  it("الموبايل كان أوفلاين وبعدين رجع والنفق واقع ⇒ عند الـ١٨٠ث الفحص واصل ⇒ server_down بالكود (مش net_lost)", async () => {
    net.up = false; net.code = "network";
    const r = reachSpy(false, true);
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
    await until(() => ev.weak.length === 1);
    await until(() => ev.fatal.length === 1, WEAK_NET_GIVE_UP_MS + 30_000);
    expect(ev.fatalArgs).toEqual([["server_down", "network"]]);
    expect(ev.fatalAt[0] - ev.weakAt[0]).toBeGreaterThanOrEqual(WEAK_NET_GIVE_UP_MS);
    expect(r.calls.length).toBe(2);
    await stopNow(ctrl);
  });

  it("٦ network + ٢ http_503 ⇒ وضع ضعيف (الأغلبية)، والفحص واصل والجسّة network ⇒ tunnel_error", async () => {
    net.up = false;
    net.codeFor = (i) => (i === 2 || i === 5 ? "http_503" : "network");
    const r = reachSpy(true);
    const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
    await until(() => net.failures >= 8);
    expect(ev.weak).toEqual([true]);
    const t8 = Date.now();
    await until(() => ev.fatal.length === 1, 30_000);
    expect(ev.fatalAt[0] - t8).toBeLessThanOrEqual(15_000);
    expect(ev.fatalArgs).toEqual([["server_down", "tunnel_error"]]);
    await stopNow(ctrl);
  });

  it.each([["hang"], ["reject"]] as Array<[ReachAnswer]>)(
    "فحص بيـ%s ⇒ بيتحسب «مش واصل» — ضعيف، والاستسلام net_lost بيحصل برضه (الجلسة ماتعلّقش)",
    async (a) => {
      net.up = false; net.code = "network";
      const r = reachSpy(a);
      const { ev, ctrl } = await boot({ ...WEAK, checkReachable: r.fn });
      await until(() => ev.weak.length === 1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ev.fatal).toEqual([]);
      // والجسّات لسه شغّالة (الفحص المعلّق مايوقّفهاش للأبد)
      const n = net.sends.length;
      await vi.advanceTimersByTimeAsync(40_000);
      expect(net.sends.length).toBeGreaterThan(n);
      await until(() => ev.fatal.length === 1, WEAK_NET_GIVE_UP_MS + 40_000);
      expect(ev.fatalArgs).toEqual([["net_lost", "network"]]);
      expect(ev.fatalAt[0] - ev.weakAt[0]).toBeLessThanOrEqual(WEAK_NET_GIVE_UP_MS + 20_000);
      await stopNow(ctrl);
    },
  );

  describe("🔒 الفحص طاير والجلسة اتغيّرت ⇒ ولا وقوع ولا جسّات", () => {
    it("stop() وفحص الدخول طاير، ورجع «واصل» بعد الإيقاف ⇒ مافيش وقوع ولا طلبات", async () => {
      net.up = false; net.code = "network";
      const d = deferred<boolean>();
      const fn = vi.fn(() => d.promise);
      const { ev, ctrl } = await boot({ ...WEAK, checkReachable: fn });
      await until(() => ev.weak.length === 1);
      expect(fn).toHaveBeenCalledTimes(1);
      await until(() => net.inflight === 0, 10_000);
      await stopNow(ctrl);
      const n = net.sends.length;
      d.resolve(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ev.fatal).toEqual([]);
      expect(net.sends.length).toBe(n);
      expect(ev.weak).toEqual([true]);
    });

    it("stop() وفحص التأكيد (بعد جسّة network) طاير ⇒ مافيش tunnel_error بعد الإيقاف", async () => {
      net.up = false; net.code = "network";
      const d = deferred<boolean>();
      let k = 0;
      const fn = vi.fn(() => (++k === 1 ? Promise.resolve(true) : d.promise));
      const { ev, ctrl } = await boot({ ...WEAK, checkReachable: fn });
      await until(() => fn.mock.calls.length === 2, 30_000);
      await until(() => net.inflight === 0, 10_000);
      await stopNow(ctrl);
      d.resolve(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ev.fatal).toEqual([]);
    });

    it("stop() وفحص الاستسلام طاير ⇒ مافيش وقوع بعد الإيقاف", async () => {
      net.up = false; net.code = "network";
      const d = deferred<boolean>();
      let k = 0;
      const fn = vi.fn(() => (++k === 1 ? Promise.resolve(false) : d.promise));
      const { ev, ctrl } = await boot({ ...WEAK, checkReachable: fn });
      await until(() => fn.mock.calls.length === 2, WEAK_NET_GIVE_UP_MS + 30_000);
      expect(ev.fatal).toEqual([]);
      // وهو مستني الفحص: ولا جسّة تانية
      const n = net.sends.length;
      await vi.advanceTimersByTimeAsync(3_000);
      expect(net.sends.length).toBe(n);
      await stopNow(ctrl);
      d.resolve(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ev.fatal).toEqual([]);
      expect(net.sends.length).toBe(n);
    });

    it("فحص قديم رجع «واصل» بعد ما الشبكة رجعت ووقعت تاني ⇒ مالوش أثر على الوقعة الجديدة", async () => {
      net.up = false; net.code = "network";
      const d = deferred<boolean>();
      let k = 0;
      // الأول طاير لحد ما نرجّعه بإيدنا، التاني (الوقعة الجديدة) مش واصل، وأي فحص بعده واصل
      const fn = vi.fn(() => (++k === 1 ? d.promise : k === 2 ? Promise.resolve(false) : Promise.resolve(true)));
      const { ev, ctrl } = await boot({ ...WEAK, checkReachable: fn });
      await until(() => ev.weak.length === 1);
      net.up = true;
      await until(() => ev.weak.length === 2, 30_000);
      await vi.advanceTimersByTimeAsync(40_000);
      net.up = false;
      await until(() => ev.weak.length === 3, 60_000);
      expect(fn).toHaveBeenCalledTimes(2);
      // الفحص القديم رجع دلوقتي «واصل» — ده عن وقعة خلصت
      d.resolve(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ev.fatal).toEqual([]);
      expect(ev.weak).toEqual([true, false, true]);
      await stopNow(ctrl);
    });
  });

  it("🔒 بلا العلم: checkReachable عمره ما بيتنده — tunnel_down مع كل فشل بالحرف", async () => {
    net.up = false; net.code = "network";
    const r = reachSpy(true);
    const { ev, ctrl } = await boot({ onWeakNet: undefined, checkReachable: r.fn });
    await until(() => net.failures >= 12);
    expect(r.fn).not.toHaveBeenCalled();
    expect(ev.fatalArgs).toEqual([["tunnel_down"], ["tunnel_down"], ["tunnel_down"], ["tunnel_down"], ["tunnel_down"]]);
    expect(ev.weak).toEqual([]);
    await stopNow(ctrl);
  });
});
