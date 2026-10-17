/**
 * 🧮 الموقع في المجمّع = موقع التطبيق (`@/lib/gps` → gpsService)، مش `navigator.geolocation`.
 *
 * المعمل كان بيفتح `navigator.geolocation.watchPosition` بنفسه. جوّه تطبيق قناص على
 * الآيفون ده بيطلّع رسالة «platehunter-ksa.vercel.app would like to use your current
 * location» (بلاغ المالك ٢٧ سبتمبر — `__tests__/gpsNoWebFallbackOnNative.test.ts`).
 * فالمراقبة بقت من خدمة التطبيق (أصلي على الموبايل، ويب في المتصفّح) — وباقي الملف زي
 * المعمل (`currentFix` · `subscribeGps` · الحالة) عشان FixCollector/platePin مايتغيّروش.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cb = (c: { lat: number; lng: number; accuracy: number; timestamp: number } | null) => void;
const svc = vi.hoisted(() => ({
  cbs: new Set<Cb>(),
  starts: 0,
  stops: 0,
}));

vi.mock("@/lib/gps", () => ({
  // المتصفّح: مراقبة المجمّع الخاصة (أندرويد بس — gpsFastWatch.test.ts) مابتتفتحش
  isNativeApp: async () => false,
  gpsService: {
    startTracking: async () => { svc.starts++; },
    stopTracking: () => { svc.stops++; },
    subscribe: (cb: Cb) => { svc.cbs.add(cb); cb(null); return () => svc.cbs.delete(cb); },
  },
}));

const emit = (c: Parameters<Cb>[0]) => { for (const cb of [...svc.cbs]) cb(c); };
const geoSpy = vi.fn();

beforeEach(() => {
  vi.resetModules();
  svc.cbs.clear(); svc.starts = 0; svc.stops = 0;
  geoSpy.mockClear();
  vi.stubGlobal("navigator", {
    geolocation: { watchPosition: () => { geoSpy(); return 1; }, clearWatch: geoSpy, getCurrentPosition: geoSpy },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("startGpsWatch من خدمة التطبيق", () => {
  it("بيشغّل خدمة التطبيق مرة واحدة لكل المستخدمين، ومابيلمسش الويب (geolocation بتاع المتصفّح)", async () => {
    const gps = await import("../gps");
    const stopA = gps.startGpsWatch();
    const stopB = gps.startGpsWatch();
    await Promise.resolve();
    expect(svc.starts).toBe(1);
    expect(gps.gpsStatus()).toBe("requesting");
    stopA();
    expect(svc.stops).toBe(0);
    stopB();
    expect(svc.stops).toBe(1);
    expect(gps.gpsStatus()).toBe("idle");
    expect(geoSpy).not.toHaveBeenCalled();
  });

  it("كل قراءة من الخدمة ⇒ currentFix بوقتها الحقيقي + الحالة «active» + المشتركين بيتبلّغوا", async () => {
    const gps = await import("../gps");
    const seen: number[] = [];
    const unsub = gps.subscribeGps(() => seen.push(gps.currentFix()?.at ?? -1));
    const stop = gps.startGpsWatch();
    emit({ lat: 24.7, lng: 46.6, accuracy: 8, timestamp: 1_700_000_000_000 });
    expect(gps.currentFix()).toEqual({ lat: 24.7, lng: 46.6, accuracy: 8, at: 1_700_000_000_000 });
    expect(gps.gpsStatus()).toBe("active");
    expect(seen).toContain(1_700_000_000_000);
    unsub(); stop();
  });

  it("بعد الإيقاف القراءات مابتوصلش (الاشتراك اتشال)", async () => {
    const gps = await import("../gps");
    const stop = gps.startGpsWatch();
    emit({ lat: 1, lng: 2, accuracy: 5, timestamp: 10 });
    stop();
    emit({ lat: 9, lng: 9, accuracy: 5, timestamp: 20 });
    expect(gps.currentFix()?.at).toBe(10);
  });
});
