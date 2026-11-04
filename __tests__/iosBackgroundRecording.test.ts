import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🍏 **الآيفون 1.4: الصوت يكمّل في الخلفية زي الأندرويد** (المالك ٤ نوفمبر ٢٠٢٦: «عايز انزل ميزة ان الصوت يشتغل علي
 * الايفون في فويس برو وفي التسجيل زي ما بيحصل علي الاندرويد»).
 *
 * الأندرويد بيحقن `window.PlateHunterBg` (جسر متزامن). الآيفون: بلجن Capacitor اسمه «PlateHunterBackground» متسجّل في
 * `MainViewController` (AppDelegate.swift) — بيشغّل موقع الآيفون نفسه في الخلفية (مكتبة الموقع بتقف لما البرنامج يخرج)
 * وبيبعت «call» لما مكالمة تقطع الصوت.
 *  · نسخة الآيفون القديمة (1.3) مافيهاش البلجن ⇒ ولا حاجة بتتغيّر.
 *  · 🛑 السوبر أدمن + حساب مراجعين أبل الأول (`BG_RECORDING_IOS_FOR_ALL = false`) — الفتح للكل من الموقع بعد تجربة المالك.
 */
type Fix = { lat: number; lng: number; accuracy: number; timestamp: number };
type Handler = (d: unknown) => void;
type Pos = { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number };

let available: boolean;
let platform: "ios" | "android";
let handlers: Record<string, Handler[]>;
let removed: string[];
let plugin: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
};
let getCurrentPosition: ReturnType<typeof vi.fn>;
let vis = "visible";

async function load() {
  vi.resetModules();
  handlers = {};
  removed = [];
  plugin = {
    start: vi.fn(async () => ({ ok: true, location: true })),
    stop: vi.fn(async () => {}),
    addListener: vi.fn((ev: string, fn: Handler) => {
      (handlers[ev] ??= []).push(fn);
      return Promise.resolve({
        remove: async () => {
          removed.push(ev);
          handlers[ev] = (handlers[ev] ?? []).filter((h) => h !== fn);
        },
      });
    }),
  };
  getCurrentPosition = vi.fn(async (): Promise<Pos> => ({ coords: { latitude: 24.1, longitude: 46.1, accuracy: 9 }, timestamp: Date.now() }));
  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      isPluginAvailable: (n: string) => available && n === "PlateHunterBackground",
    },
    registerPlugin: (n: string) => (n === "PlateHunterBackground" ? plugin : null),
  }));
  vi.doMock("@capacitor/geolocation", () => ({
    Geolocation: {
      requestPermissions: async () => ({ location: "granted" }),
      getCurrentPosition,
      watchPosition: async () => "w1",
      clearWatch: async () => {},
    },
  }));
  const bg = await import("@/lib/backgroundRecording");
  const gps = await import("@/lib/gps");
  gps.__resetNativeCache();
  return { bg, gps };
}
const emit = (ev: string, d: unknown) => { for (const h of handlers[ev] ?? []) h(d); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  available = true;
  platform = "ios";
  vis = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => vis });
});
afterEach(() => {
  delete (window as Window & { PlateHunterBg?: unknown }).PlateHunterBg;
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@capacitor/geolocation");
  vi.useRealTimers();
});

describe("🍏 مين يكمّل في الخلفية على الآيفون", () => {
  it("🛑 السوبر أدمن + حساب مراجعين أبل بس — المناديب لسه لأ (`BG_RECORDING_IOS_FOR_ALL = false`)", async () => {
    const { bg } = await load();
    expect(bg.BG_RECORDING_IOS_FOR_ALL).toBe(false);
    expect(bg.canRecordInBackground(true)).toBe(true);
    expect(bg.canRecordInBackground(false, "asemafify40@gmail.com")).toBe(true);
    expect(bg.canRecordInBackground(false, " AsemAfify40@Gmail.com ")).toBe(true);
    expect(bg.canRecordInBackground(false, "agent@qannas-ksa.com")).toBe(false);
    expect(bg.canRecordInBackground(false, null)).toBe(false);
  });

  it("نسخة الآيفون القديمة (1.3 — مافيهاش البلجن) ⇒ ولا حد، زي الأول بالحرف", async () => {
    available = false;
    const { bg } = await load();
    expect(bg.canRecordInBackground(true)).toBe(false);
    expect(bg.startBackgroundRecording()).toBe(false);
    expect(plugin.start).not.toHaveBeenCalled();
  });

  it("🤖 الأندرويد مايتلمسش — جسره هو اللي بيشتغل وللكل زي ما هو", async () => {
    platform = "android";
    available = false;
    const { bg } = await load();
    const start = vi.fn(() => true);
    (window as Window & { PlateHunterBg?: unknown }).PlateHunterBg = { start, stop: () => {} };
    expect(bg.canRecordInBackground(false, "agent@qannas-ksa.com")).toBe(true);
    expect(bg.startBackgroundRecording()).toBe(true);
    expect(start).toHaveBeenCalledWith(bg.BG_RECORDING_TEXT);
    expect(plugin.start).not.toHaveBeenCalled();
  });
});

describe("🍏 تشغيل/إيقاف", () => {
  it("«ابدأ» ⇒ البلجن يشتغل ويسمع للموقع وللمكالمة · «إيقاف» ⇒ يقف ويشيل السامعين", async () => {
    const { bg } = await load();
    expect(bg.startBackgroundRecording()).toBe(true);
    await flush();
    expect(plugin.start).toHaveBeenCalledTimes(1);
    expect(Object.keys(handlers).sort()).toEqual(["call", "location"]);
    bg.stopBackgroundRecording();
    await flush();
    expect(plugin.stop).toHaveBeenCalledTimes(1);
    expect(removed.sort()).toEqual(["call", "location"]);
    // تسجيل جديد ⇒ سامعين جداد (مش مكررين)
    bg.startBackgroundRecording();
    await flush();
    expect(handlers.location.length).toBe(1);
    expect(handlers.call.length).toBe(1);
  });

  it("البلجن رفض/وقع ⇒ الصفحة ماتقعش (ولا وعد مرفوض سايب)", async () => {
    const { bg } = await load();
    plugin.start.mockImplementation(async () => { throw new Error("x"); });
    plugin.stop.mockImplementation(async () => { throw new Error("y"); });
    expect(() => bg.startBackgroundRecording()).not.toThrow();
    expect(() => bg.stopBackgroundRecording()).not.toThrow();
    await flush();
  });

  it("📞 مكالمة قطعت الصوت («call» من الآيفون) ⇒ نفس حدث الأندرويد `phNativeCall` ⇒ الصفحة تقفل الميك", async () => {
    const { bg } = await load();
    const fn = vi.fn();
    const off = bg.onNativeCall(fn);
    bg.startBackgroundRecording();
    await flush();
    emit("call", {});
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("📍 الموقع من الآيفون نفسه بيوصل لخدمة الموقع (Voice PRO والتسجيل الاتنين بيقروا منها)", async () => {
    const { bg, gps } = await load();
    const seen: (Fix | null)[] = [];
    const unsub = gps.gpsService.subscribe((c) => seen.push(c as Fix | null));
    bg.startBackgroundRecording();
    await flush();
    const before = gps.gpsService.watchStats().updates;
    emit("location", { lat: 24.77, lng: 46.71, accuracy: 6, timestamp: Date.now() });
    expect(gps.gpsService.getLastCoords()?.lat).toBe(24.77);
    expect(gps.gpsService.watchStats().updates).toBe(before + 1);
    expect(seen[seen.length - 1]?.lat).toBe(24.77);
    // قيمة بايظة ⇒ تتجاهل
    emit("location", { lat: Number.NaN, lng: 46.71, accuracy: 6, timestamp: Date.now() });
    expect(gps.gpsService.getLastCoords()?.lat).toBe(24.77);
    unsub();
  });
});

describe("📍 كل لوحة بموقعها والبرنامج في الخلفية", () => {
  it("البرنامج في الخلفية + موقع الآيفون شغّال ⇒ اللوحة تاخد آخر موقع على طول (مانستناش ٨ ثواني على قراية مش جاية)", async () => {
    const { gps } = await load();
    vi.useFakeTimers();
    await gps.gpsService.startTracking();
    const calls = getCurrentPosition.mock.calls.length;
    vis = "hidden";
    vi.advanceTimersByTime(2000);
    gps.gpsService.feedNativeFix({ lat: 24.8, lng: 46.8, accuracy: 5, timestamp: Date.now() });
    vi.advanceTimersByTime(1500);   // أقدم من ٩٠٠ مللي ⇒ من غير الحل ده كانت هتطلب قراية جديدة
    const fx = await gps.gpsService.getFreshReading({ timeoutMs: 8000 });
    expect(fx?.lat).toBe(24.8);
    expect(getCurrentPosition.mock.calls.length).toBe(calls);
    gps.gpsService.stopTracking();
  });

  it("البرنامج قدامه ⇒ زي الأول بالحرف (قراية جديدة)", async () => {
    const { gps } = await load();
    vi.useFakeTimers();
    await gps.gpsService.startTracking();
    const calls = getCurrentPosition.mock.calls.length;
    gps.gpsService.feedNativeFix({ lat: 24.8, lng: 46.8, accuracy: 5, timestamp: Date.now() });
    vi.advanceTimersByTime(1500);
    await gps.gpsService.getFreshReading({ timeoutMs: 8000 });
    expect(getCurrentPosition.mock.calls.length).toBe(calls + 1);
    gps.gpsService.stopTracking();
  });

  it("في الخلفية بس موقع الآيفون وقف (أقدم من ٣ ثواني) ⇒ زي الأول (قراية جديدة)", async () => {
    const { gps } = await load();
    vi.useFakeTimers();
    await gps.gpsService.startTracking();
    const calls = getCurrentPosition.mock.calls.length;
    vis = "hidden";
    gps.gpsService.feedNativeFix({ lat: 24.8, lng: 46.8, accuracy: 5, timestamp: Date.now() });
    vi.advanceTimersByTime(3500);
    await gps.gpsService.getFreshReading({ timeoutMs: 8000 });
    expect(getCurrentPosition.mock.calls.length).toBe(calls + 1);
    gps.gpsService.stopTracking();
  });
});
