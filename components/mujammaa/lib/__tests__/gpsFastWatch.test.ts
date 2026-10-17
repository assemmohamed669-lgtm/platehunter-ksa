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
 * صفحته مفتوحة. مراقبة التطبيق نفسها (`gpsService`) **ماتتلمسش** — المناديب زي ما هم.
 *  · أندرويد بس: كل مراقبة هناك طلب مستقل. على الآيفون كل المراقبات على مدير موقع
 *    واحد بيبعت كل قراءة لكل المشتركين أصلاً (مافيش `interval`)، ومهلته مشتركة —
 *    مهلة مراقبة جديدة ممكن تقفل مراقبة التطبيق ⇒ مابنفتحش تانية هناك.
 *  · القراءة الخام نفسها (مش «الأفضل» المحجوز ١٠ث من `pickBetterFix`).
 *  · الأحدث بس يكتب: قراءة أقدم من الخدمة مابترجّعش الموقع لورا.
 *  · خطأ عابر ⇒ نعيد المراقبة بمهلة بتطول؛ الإذن/الموقع مقفول ⇒ مانعيدش (رسالة تشغيل
 *    الموقع كانت هتطلع كل شوية).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SvcCb = (c: { lat: number; lng: number; accuracy: number; timestamp: number } | null) => void;
type Pos = { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number };
type WatchCb = (pos: Pos | null, err?: { code?: string; message?: string }) => void;

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
}));

vi.mock("@/lib/gps", () => ({
  isNativeApp: async () => h.native,
  gpsService: {
    startTracking: async () => { h.starts++; },
    stopTracking: () => { h.stops++; },
    subscribe: (cb: (c: unknown) => void) => { h.svcCbs.add(cb); cb(null); return () => h.svcCbs.delete(cb); },
  },
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    watchPosition: (opts: Record<string, unknown>, cb: (pos: unknown, err?: unknown) => void) => {
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
    },
    clearWatch: async ({ id }: { id: string }) => {
      h.cleared.push(id);
      const w = h.watches.find((x) => x.id === id);
      if (w) w.cleared = true;
    },
  },
}));

const T0 = 1_790_000_000_000;
const pos = (t: number, lat: number, accuracy = 6): Pos => ({
  coords: { latitude: lat, longitude: 46.7, accuracy },
  timestamp: t,
});
const svcEmit = (c: Parameters<SvcCb>[0]) => { for (const cb of [...h.svcCbs]) cb(c); };
const live = () => h.watches.filter((w) => !w.cleared);
/** يخلّص كل الوعود المعلّقة (استيراد ديناميكي + isNativeApp + id) */
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
  setPlatform("android");
});
afterEach(() => {
  vi.useRealTimers();
  setPlatform(null);
});

describe("أندرويد — مراقبة المجمّع كل ثانية", () => {
  it("بتفتح مراقبة أصلية واحدة: كل ثانية + أقل فاصل ثانية + دقة عالية + من غير كاش — وخدمة التطبيق زي ما هي", async () => {
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

  it("خطأ عابر (مهلة) ⇒ المراقبة القديمة بتتقفل وبتتفتح تاني بعد ثانيتين، والمهلة بتطول مع التكرار وبترجع بعد قراءة", async () => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    const w1 = live()[0];
    w1.cb(null, { code: "OS-PLUG-GLOC-0010", message: "timeout" });
    await flush();
    expect(h.cleared).toContain(w1.id);
    expect(live()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MIN_MS - 1);
    expect(live()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(live()).toHaveLength(1);
    // خطأ تاني على طول ⇒ الضعف
    const w2 = live()[0];
    w2.cb(null, { code: "OS-PLUG-GLOC-0002" });
    await flush();
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MIN_MS * 2 - 1);
    expect(live()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(live()).toHaveLength(1);
    // قراءة ناجحة ⇒ المهلة بترجع لأولها
    const w3 = live()[0];
    w3.cb(pos(T0, 24.2));
    w3.cb(null, { code: "OS-PLUG-GLOC-0010" });
    await flush();
    await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MIN_MS);
    await flush();
    expect(live()).toHaveLength(1);
    // القراءات من المراقبة القديمة بعد ما اتقفلت مابتتحسبش
    w1.cb(pos(T0 + 99_000, 30));
    expect(gps.currentFix()?.lat).toBe(24.2);
    stop();
    await flush();
  });

  it("المهلة ليها سقف (٣٠ث) مهما الأخطاء اتكررت", async () => {
    vi.useFakeTimers();
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    for (let i = 0; i < 8; i++) {
      live()[0].cb(null, { code: "OS-PLUG-GLOC-0010" });
      await flush();
      await vi.advanceTimersByTimeAsync(gps.FAST_REARM_MAX_MS);
      await flush();
      expect(live()).toHaveLength(1);
    }
    stop();
    await flush();
  });

  it.each([
    ["OS-PLUG-GLOC-0003", "الإذن مرفوض"],
    ["OS-PLUG-GLOC-0007", "الموقع مقفول"],
    ["OS-PLUG-GLOC-0009", "رفض تشغيل الموقع"],
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

describe("برّه أندرويد — مافيش مراقبة تانية", () => {
  it("الآيفون: خدمة التطبيق بس (مدير موقع واحد بيبعت كل قراءة، ومهلته مشتركة)", async () => {
    setPlatform("ios");
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    await flush();
    expect(h.starts).toBe(1);
    expect(h.watches).toHaveLength(0);
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
