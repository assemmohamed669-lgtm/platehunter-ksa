/**
 * 📍 المجمّع على أندرويد: قراءة موقع **كل ثانية** (١٧ أكتوبر ٢٠٢٦).
 *
 * تجربة المالك: ٣٣ لوحة، **٤ بس** خدوا موقع — اللي اتقالوا في الثانية ١٨ و٣٩.٥ و٥٩.٥
 * و٨٠، يعني قراءة كل ٢٠ ثانية بالظبط. السبب: مراقبة موقع التطبيق (`@/lib/gps`) على
 * أندرويد من غير `interval`، و`@capacitor/geolocation` 8 بيخلّيه = `timeout` (٢٠ث)،
 * و`minimumUpdateInterval` افتراضي ٥ث. والمجمّع بيحط الموقع من قراءة في حدود ثانيتين
 * من لحظة النطق — فلوحة كل ٣ث بتلاقي قراءة جنبها مرة من كل ٦–٧.
 *
 * المالك: «انا عايز كل سيارة تاخد موقع وقت ما المندوب قالها بالظبط وكل لوحه يبقي
 * قدامها موقعها».
 *
 * الحل جوّه المجمّع بس (سوبر أدمن): مراقبة أصلية **تانية** خاصة بيه كل ثانية طول ما
 * صفحته ظاهرة. مراقبة التطبيق نفسها (`gpsService`) **ماتتلمسش** — المناديب زي ما هم.
 *  · أندرويد بس (الآيفون: مدير موقع واحد ومهلة مشتركة — مابنفتحش تانية هناك).
 *  · القراءة الخام نفسها، والأحدث بس يكتب.
 *  · **مابتطلبش إذن**: `checkPermissions` الأول — طلبها مع طلب خدمة التطبيق كان بيلخبط
 *    ردود الاتنين (مراجعة ١٧ أكتوبر).
 *  · 🔴 البلجن الحقيقي **Proxy بيرد على أي اسم — حتى `then`** (مراجعة ١٧ أكتوبر): وعد
 *    بيتحلّ بيه بيعلّق للأبد. النسخة الأولى كانت كده والاختبارات ماحسّتش لأن البديل
 *    كان object عادي ⇒ البديل هنا Proxy زي Capacitor بالظبط.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixCollector } from "../clipStore";
import { stampEntriesWithTrack, trackFromRaw } from "../platePin";
import type { PlateEntry } from "../plateEntry";

type SvcCb = (c: { lat: number; lng: number; accuracy: number; timestamp: number } | null) => void;
type Pos = { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number };

const h = vi.hoisted(() => ({
  native: true,
  svcCbs: new Set<(c: unknown) => void>(),
  starts: 0,
  stops: 0,
  watches: [] as Array<{ opts: Record<string, unknown>; cb: (pos: unknown, err?: unknown) => void; id: string; resolve: () => void; cleared: boolean }>,
  cleared: [] as string[],
  holdIds: false,
  rejectNext: null as null | { code?: string; message?: string },
  nextId: 0,
  /** `checkPermissions().location` — أو "off" = الموقع مقفول من الموبايل (بيرمي) */
  perm: "granted" as string,
  permChecks: 0,
  /** أي دالة تانية اتندهت على البلجن (requestPermissions مثلاً) */
  otherCalls: [] as string[],
}));

vi.mock("@/lib/gps", () => ({
  isNativeApp: async () => h.native,
  gpsService: {
    startTracking: async () => { h.starts++; },
    stopTracking: () => { h.stops++; },
    subscribe: (cb: (c: unknown) => void) => { h.svcCbs.add(cb); cb(null); return () => h.svcCbs.delete(cb); },
  },
}));

/**
 * زي `registerPlugin` بتاع Capacitor: **أي** خاصية (حتى `then`) بترجع دالة. `then`
 * على الموبايل بيرمي جوّه وعد ومابيندهش resolve ولا reject أبداً ⇒ هنا كمان.
 */
vi.mock("@capacitor/geolocation", () => {
  const impl: Record<string, (...a: never[]) => unknown> = {
    watchPosition: ((opts: Record<string, unknown>, cb: (pos: unknown, err?: unknown) => void) => {
      if (h.rejectNext) {
        const e = h.rejectNext;
        h.rejectNext = null;
        return Promise.reject(Object.assign(new Error(e.message ?? "watch failed"), e));
      }
      const id = `w${++h.nextId}`;
      let resolve = () => {};
      const p = new Promise<string>((r) => { resolve = () => r(id); });
      h.watches.push({ opts, cb, id, resolve, cleared: false });
      if (!h.holdIds) resolve();
      return p;
    }) as never,
    clearWatch: (async ({ id }: { id: string }) => {
      h.cleared.push(id);
      const w = h.watches.find((x) => x.id === id);
      if (w) w.cleared = true;
    }) as never,
    checkPermissions: (async () => {
      h.permChecks++;
      if (h.perm === "off") throw Object.assign(new Error("Location services are not enabled."), { code: "OS-PLUG-GLOC-0007" });
      return { location: h.perm, coarseLocation: h.perm === "denied" ? "denied" : "granted" };
    }) as never,
  };
  const Geolocation = new Proxy({}, {
    get(_t, prop: string) {
      if (prop in impl) return impl[prop];
      if (prop === "$$typeof" || prop === "toJSON") return undefined;
      return (..._a: unknown[]) => {
        h.otherCalls.push(String(prop));
        return new Promise(() => {}); // زي `then` الحقيقي: مابيخلصش
      };
    },
  });
  return { Geolocation };
});

const T0 = 1_790_000_000_000;
const pos = (t: number, lat: number, accuracy = 6): Pos => ({
  coords: { latitude: lat, longitude: 46.7, accuracy },
  timestamp: t,
});
const svcEmit = (c: Parameters<SvcCb>[0]) => { for (const cb of [...h.svcCbs]) cb(c); };
const live = () => h.watches.filter((w) => !w.cleared);
/** يخلّص كل الوعود المعلّقة (استيراد ديناميكي + isNativeApp + الإذن + id) */
const flush = async () => {
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await vi.dynamicImportSettled();
  }
};

function setPlatform(p: string | null) {
  const w = window as unknown as { Capacitor?: { getPlatform: () => string } };
  if (p === null) delete w.Capacitor;
  else w.Capacitor = { getPlatform: () => p };
}

beforeEach(() => {
  vi.resetModules();
  h.native = true;
  h.svcCbs.clear();
  h.starts = 0;
  h.stops = 0;
  h.watches = [];
  h.cleared = [];
  h.holdIds = false;
  h.rejectNext = null;
  h.nextId = 0;
  h.perm = "granted";
  h.permChecks = 0;
  h.otherCalls = [];
  setPlatform("android");
});
afterEach(() => {
  vi.useRealTimers();
  setPlatform(null);
});

describe("أندرويد — مراقبة المجمّع كل ثانية", () => {
  it("🔴 بتتفتح فعلاً مع بلجن Capacitor الحقيقي (Proxy بيرد على `then`) — مراقبة واحدة كل ثانية + أقل فاصل ثانية + دقة عالية + من غير كاش", async () => {
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(h.starts).toBe(1);
    expect(live()).toHaveLength(1);
    expect(live()[0].opts).toMatchObject({
      enableHighAccuracy: true,
      maximumAge: 0,
      interval: 1000,
      minimumUpdateInterval: 1000,
    });
    // مهلة أول قراءة بس — طويلة عشان مابتموتش جوّه جراج
    expect(Number(live()[0].opts.timeout)).toBeGreaterThanOrEqual(600_000);
    // مافيش أي نداء تاني على البلجن (ولا then ولا requestPermissions)
    expect(h.otherCalls).toEqual([]);
    stop();
    await flush();
  });

  it("كل قراءة خام بتوصل currentFix — حتى لو أوسع من اللي قبلها (مش «الأفضل» المحجوز)", async () => {
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    const w = live()[0];
    w.cb(pos(T0, 24.1, 5));
    expect(gps.currentFix()).toEqual({ lat: 24.1, lng: 46.7, accuracy: 5, at: T0 });
    w.cb(pos(T0 + 1000, 24.1001, 60));
    expect(gps.currentFix()).toEqual({ lat: 24.1001, lng: 46.7, accuracy: 60, at: T0 + 1000 });
    expect(gps.gpsStatus()).toBe("active");
    stop();
    await flush();
  });

  it("قراءة أقدم من خدمة التطبيق مابترجّعش الموقع لورا", async () => {
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    live()[0].cb(pos(T0 + 5000, 24.5));
    svcEmit({ lat: 24.0, lng: 46.7, accuracy: 3, timestamp: T0 + 1000 });
    expect(gps.currentFix()?.at).toBe(T0 + 5000);
    // والأحدث منها بيعدّي عادي (أول قراءة سريعة أو قراءة من صفحة تانية)
    svcEmit({ lat: 24.6, lng: 46.7, accuracy: 9, timestamp: T0 + 6000 });
    expect(gps.currentFix()?.lat).toBe(24.6);
    stop();
    await flush();
  });

  it("وقت وصول آخر قراءة جديدة بيتحفظ (للتحذير) — والقراءة المكرّرة مابتحدّثهوش", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 10_000);
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    live()[0].cb(pos(T0 + 2_000, 24.5)); // ساعة الأقمار ورا ساعة الموبايل ٨ث
    expect(gps.lastFixRecvAt()).toBe(T0 + 10_000);
    vi.setSystemTime(T0 + 12_000);
    svcEmit({ lat: 24.5, lng: 46.7, accuracy: 6, timestamp: T0 + 2_000 }); // نفس القراءة تاني
    expect(gps.lastFixRecvAt()).toBe(T0 + 10_000);
    stop();
    await flush();
  });

  it("الإيقاف بيقفل المراقبة، وأي قراءة بعده مابتوصلش", async () => {
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    const w = live()[0];
    stop();
    await flush();
    expect(h.cleared).toEqual([w.id]);
    w.cb(pos(T0 + 9000, 25));
    expect(gps.currentFix()).toBeNull();
    expect(h.stops).toBe(1);
  });

  it("الإيقاف قبل ما رقم المراقبة يرجع ⇒ بتتقفل أول ما يرجع (مافيش مراقبة سايبة)", async () => {
    h.holdIds = true;
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(h.watches).toHaveLength(1);
    stop();
    await flush();
    expect(h.cleared).toEqual([]);
    h.watches[0].resolve();
    await flush();
    expect(h.cleared).toEqual([h.watches[0].id]);
  });

  it("الإيقاف قبل ما المراقبة تتفتح أصلاً ⇒ مابتتفتحش", async () => {
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    stop();
    await flush();
    expect(h.watches).toHaveLength(0);
  });

  it("صفحتين بيشاركوا نفس المراقبة؛ بتتقفل مع آخر واحدة بس", async () => {
    const gps = await import("../gps");
    const a = gps.startGpsWatch();
    const b = gps.startGpsWatch();
    await flush();
    expect(h.watches).toHaveLength(1);
    a();
    await flush();
    expect(h.cleared).toEqual([]);
    b();
    await flush();
    expect(h.cleared).toEqual([h.watches[0].id]);
  });

  it("فتح/قفل/فتح بسرعة (StrictMode) ⇒ مراقبة واحدة شغّالة في الآخر", async () => {
    const gps = await import("../gps");
    const s1 = gps.startGpsWatch();
    await flush();
    s1();
    const s2 = gps.startGpsWatch();
    await flush();
    expect(live()).toHaveLength(1);
    s2();
    await flush();
    expect(live()).toHaveLength(0);
  });
});

describe("أندرويد — الإذن: سؤال بس، عمره ما يطلب", () => {
  it("🔴 الإذن لسه مااتداش ⇒ مابتفتحش المراقبة (كانت هتطلب الإذن بنفسها وتلخبط طلب خدمة التطبيق)، وبتسأل تاني لحد ما ييجي", async () => {
    vi.useFakeTimers();
    h.perm = "prompt";
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(h.watches).toHaveLength(0);
    expect(h.permChecks).toBe(1);
    await vi.advanceTimersByTimeAsync(gps.FAST_PERM_RECHECK_MS);
    await flush();
    expect(h.permChecks).toBe(2);
    expect(h.watches).toHaveLength(0);
    // خدمة التطبيق خدت الإذن من المندوب
    h.perm = "granted";
    await vi.advanceTimersByTimeAsync(gps.FAST_PERM_RECHECK_MS);
    await flush();
    expect(live()).toHaveLength(1);
    expect(h.otherCalls).toEqual([]); // ولا requestPermissions ولا أي حاجة تانية
    stop();
    await flush();
  });

  it("«تقريبي» بس (Android 12+) ⇒ مابتفتحش (كانت هتطلّع رسالة «الموقع الدقيق» كل مرة)", async () => {
    vi.useFakeTimers();
    h.perm = "denied"; // location (الدقيق) مرفوض، coarseLocation متاح
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    await vi.advanceTimersByTimeAsync(gps.FAST_PERM_RECHECK_MS * 3);
    await flush();
    expect(h.watches).toHaveLength(0);
    stop();
    await flush();
  });

  it("الموقع مقفول من الموبايل (السؤال بيرمي) ⇒ مابتفتحش — ولما يتفتح بتشتغل", async () => {
    vi.useFakeTimers();
    h.perm = "off";
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(h.watches).toHaveLength(0);
    h.perm = "granted";
    await vi.advanceTimersByTimeAsync(gps.FAST_PERM_RECHECK_MS);
    await flush();
    expect(live()).toHaveLength(1);
    stop();
    await flush();
  });

  it("الصفحة اتقفلت وهي بتستنى الإذن ⇒ مابتسألش تاني", async () => {
    vi.useFakeTimers();
    h.perm = "prompt";
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    stop();
    await vi.advanceTimersByTimeAsync(gps.FAST_PERM_RECHECK_MS * 5);
    await flush();
    expect(h.permChecks).toBe(1);
  });
});

describe("أندرويد — الأخطاء", () => {
  it("المهلة (0010) ⇒ بتتقفل وبتتفتح تاني بعد ثانيتين — من غير ما المهلة تطول مهما اتكررت", async () => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    for (let i = 0; i < 4; i++) {
      const w = live()[0];
      w.cb(null, { code: "OS-PLUG-GLOC-0010", message: "timeout" });
      await flush();
      expect(h.cleared).toContain(w.id);
      expect(live()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MIN_MS - 1);
      expect(live()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(live()).toHaveLength(1);
    }
    stop();
    await flush();
  });

  it("خطأ تاني ⇒ المهلة بتطول (٢ ⇐ ٤ …) لحد ١٠ث، وقراءة ناجحة بترجّعها لأولها", async () => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    const waits: number[] = [];
    for (let i = 0; i < 5; i++) {
      live()[0].cb(null, { code: "OS-PLUG-GLOC-0002" });
      await flush();
      let waited = 0;
      while (live().length === 0 && waited < 60_000) {
        await vi.advanceTimersByTimeAsync(500);
        await flush();
        waited += 500;
      }
      waits.push(waited);
    }
    expect(waits).toEqual([2000, 4000, 8000, 10_000, 10_000]);
    // قراءة ناجحة ⇒ أول مهلة تاني
    live()[0].cb(pos(T0, 24.2));
    live()[0].cb(null, { code: "OS-PLUG-GLOC-0002" });
    await flush();
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MIN_MS);
    await flush();
    expect(live()).toHaveLength(1);
    stop();
    await flush();
  });

  it("رد من غير إحداثيات (رد إذن غلط مثلاً) ⇒ مابيرميش، وبيعيد المراقبة", async () => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    const w = live()[0];
    expect(() => w.cb({ location: "granted", coarseLocation: "granted" })).not.toThrow();
    await flush();
    expect(h.cleared).toContain(w.id);
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MIN_MS);
    await flush();
    expect(live()).toHaveLength(1);
    expect(gps.currentFix()).toBeNull();
    stop();
    await flush();
  });

  it("القراءات من مراقبة اتقفلت مابتتحسبش", async () => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    const w1 = live()[0];
    w1.cb(pos(T0, 24.2));
    w1.cb(null, { code: "OS-PLUG-GLOC-0010" });
    await flush();
    w1.cb(pos(T0 + 99_000, 30));
    expect(gps.currentFix()?.lat).toBe(24.2);
    stop();
    await flush();
  });

  it.each([
    ["OS-PLUG-GLOC-0003", "الإذن مرفوض"],
    ["OS-PLUG-GLOC-0009", "رفض تشغيل الموقع"],
    ["OS-PLUG-GLOC-0017", "موقع الشبكة مقفول"],
  ])("%s (%s) ⇒ مابنعيدش المراقبة", async (code) => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    live()[0].cb(null, { code });
    await flush();
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MAX_MS * 3);
    await flush();
    expect(live()).toHaveLength(0);
    expect(h.watches).toHaveLength(1);
    stop();
    await flush();
  });

  it("فتح المراقبة نفسه رمى ⇒ بنعيد بمهلة (ولو السبب الإذن مابنعيدش)", async () => {
    vi.useFakeTimers();
    h.rejectNext = { code: "OS-PLUG-GLOC-0002" };
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(live()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MIN_MS);
    await flush();
    expect(live()).toHaveLength(1);
    stop();
    await flush();

    h.rejectNext = { code: "OS-PLUG-GLOC-0003" };
    const stop2 = gps.startGpsWatch();
    await flush();
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MAX_MS * 2);
    await flush();
    expect(live()).toHaveLength(0);
    stop2();
  });

  it("الصفحة اتقفلت والإعادة لسه مستنية ⇒ مابتتفتحش", async () => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    live()[0].cb(null, { code: "OS-PLUG-GLOC-0010" });
    await flush();
    stop();
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MAX_MS);
    await flush();
    expect(live()).toHaveLength(0);
    expect(h.watches).toHaveLength(1);
  });
});

describe("السلسلة كلها على أندرويد: قراءات البلجن ⇒ المجمّع ⇒ الموقع قدام كل لوحة", () => {
  function entry(i: number, timeStartSec: number): PlateEntry {
    const plate = `ابح${String(1000 + i)}`;
    return {
      id: `e-${i}`,
      review: {
        plate, heardPlate: plate, letters: [...plate.slice(0, 3)], digits: plate.slice(3),
        confidence: 90, status: "solid", corrections: [], notes: [], raw: plate, order: i,
        needsAudioReview: false, timeStart: timeStartSec,
      } as unknown as PlateEntry["review"],
      pin: null,
      match: { kind: "none" } as unknown as PlateEntry["match"],
      capturedAt: T0,
      source: "batch",
    };
  }

  it("✅ ٣٣ لوحة (واحدة كل ٣ث) والبلجن بيبعت كل ثانية ⇒ ٣٣ من ٣٣ بموقع مكانها هي", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    // زي `beginClip` في BatchPage بالحرف
    const col = new FixCollector();
    const now = gps.currentFix();
    if (now) col.add(now, null);
    const unsub = gps.subscribeGps(() => col.add(gps.currentFix(), Date.now()));
    const latAt = (ms: number) => 24.7 + (ms / 1000) * 0.00009; // ~١٠ م/ث
    for (let t = 0; t <= 104_000; t += 1000) {
      vi.setSystemTime(T0 + t + 300); // بتوصل بعد ٣٠٠ مللي
      live()[0].cb(pos(T0 + t, latAt(t), 8));
      // وخدمة التطبيق بتعيد «الأفضل» عندها كل ثانية (أقدم) — مايتسجّلش تاني
      svcEmit({ lat: 24.0, lng: 46.7, accuracy: 3, timestamp: T0 });
    }
    unsub();
    const times = Array.from({ length: 33 }, (_, i) => 1.2 + i * 3);
    const out = stampEntriesWithTrack(times.map((t, i) => entry(i, t)), trackFromRaw(col.list(), T0), T0);
    expect(out.filter((e) => e.pin).length).toBe(33);
    expect(new Set(out.map((e) => e.pin!.lat.toFixed(6))).size).toBe(33);
    for (const [i, e] of out.entries()) {
      expect(Math.abs(e.pin!.lat - latAt(times[i] * 1000))).toBeLessThan(0.00001);
    }
    stop();
    await flush();
  });
});

describe("برّه أندرويد — مافيش مراقبة تانية", () => {
  it("الآيفون: خدمة التطبيق بس (مدير موقع واحد بيبعت كل قراءة، ومهلته مشتركة)", async () => {
    setPlatform("ios");
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(h.starts).toBe(1);
    expect(h.watches).toHaveLength(0);
    expect(h.permChecks).toBe(0);
    stop();
  });

  it("المتصفّح: خدمة التطبيق بس", async () => {
    h.native = false;
    setPlatform(null);
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(h.starts).toBe(1);
    expect(h.watches).toHaveLength(0);
    svcEmit({ lat: 24.3, lng: 46.7, accuracy: 7, timestamp: T0 });
    expect(gps.currentFix()?.lat).toBe(24.3);
    stop();
  });
});
