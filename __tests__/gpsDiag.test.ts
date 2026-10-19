import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gpsPlateDiag, gpsWatchDiag } from "@/lib/gpsDiag";
import { DIAG_AGENT_IDS } from "@/lib/deviceDiag";

/**
 * 📍 «بيطبق موقع لوكيشن واحد علي كل اللوحات … بتحصل مع الشخص دة بس واوقات يشتغل معاه كويس» (آيفون ١٦ برو ماكس) —
 * المالك (١٩ أكتوبر ٢٠٢٦) بعت الـID: الصندوق الأسود بيسجّل لكل لوحة في Voice PRO الموقع اتاخد إزاي — **من غير المكان نفسه**
 * (الدقة · عمر القراية · استنى قد إيه · نفس نقطة اللي قبلها بالحرف؟ · المسافة · الآيفون حدّث الموقع كام مرة من آخر لوحة).
 */
const AGENT = "56627d4f-1e8c-4f74-bf1e-8e75077d5143";
const W = (updates: number, lastAt: number, lastAcc: number | null = 6) => ({ updates, lastAt, lastAcc, running: true });
const fix = (lat: number, lng: number, timestamp: number, accuracy = 5) => ({ lat, lng, timestamp, accuracy });

describe("🔴 سطر لكل لوحة", () => {
  it("أول لوحة: الدقة وعمر القراية واستنى قد إيه — من غير الإحداثيات", () => {
    const d = gpsPlateDiag(null, fix(24.71234, 46.67567, 9_000, 4.6), 10_000, 0, W(30, 9_500), "visible");
    expect(d).toMatchObject({ fix: true, acc: 5, ageMs: 1000, waitMs: 0, watchAgeMs: 500, watchAcc: 6, watchRun: true, vis: "visible" });
    expect(JSON.stringify(d)).not.toMatch(/24\.71|46\.67/);   // مكانه مابيتسجّلش
  });
  it("🔴 نفس النقطة بالحرف بتاعة اللي قبلها + الآيفون ماحدّثش الموقع بينهم", () => {
    const prev = { fix: fix(24.7, 46.6, 5_000), at: 6_000, watchUpdates: 12 };
    const d = gpsPlateDiag(prev, fix(24.7, 46.6, 5_000), 9_000, 2400, W(12, 5_000), "visible");
    expect(d).toMatchObject({ samePrev: true, sameTsPrev: true, dPrevM: 0, dtPrevMs: 3000, watchNSincePrev: 0, waitMs: 2400 });
  });
  it("لوحة بموقع جديد: المسافة بالمتر", () => {
    const prev = { fix: fix(24.7, 46.6, 5_000), at: 6_000, watchUpdates: 12 };
    const d = gpsPlateDiag(prev, fix(24.7001, 46.6, 8_800), 9_000, 0, W(15, 8_800), "visible");
    expect(d).toMatchObject({ samePrev: false, sameTsPrev: false, watchNSincePrev: 3 });
    expect(d.dPrevM).toBeGreaterThan(8);
    expect(d.dPrevM).toBeLessThan(15);
  });
  it("مفيش موقع خالص", () => {
    expect(gpsPlateDiag(null, null, 10_000, 8000, W(0, 0, null), "visible")).toMatchObject({ fix: false, waitMs: 8000, watchAgeMs: null });
  });
});

describe("🔴 نبضة المراقب (كل ١٥ ثانية والتسجيل شغّال)", () => {
  it("الآيفون حدّث الموقع كام مرة وآخر تحديث من قد إيه", () => {
    expect(gpsWatchDiag(W(40, 95_000, 7.4), 25, 100_000)).toEqual({ n: 15, ageMs: 5000, acc: 7, running: true });
  });
});

describe("🔴 المراقب بيعدّ تحديثاته", () => {
  it("كل تحديث من الآيفون بيتعدّ", async () => {
    let cb: ((p: GeolocationPosition) => void) | null = null;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn((ok: (p: GeolocationPosition) => void) => { cb = ok; return 1; }),
        clearWatch: vi.fn(),
      },
    });
    vi.resetModules();
    const { gpsService } = await import("@/lib/gps");
    await gpsService.startTracking();
    expect(gpsService.watchStats()).toMatchObject({ updates: 0, running: true });
    cb!({ coords: { latitude: 24.7, longitude: 46.6, accuracy: 8 }, timestamp: Date.now() } as unknown as GeolocationPosition);
    cb!({ coords: { latitude: 24.7001, longitude: 46.6, accuracy: 6 }, timestamp: Date.now() } as unknown as GeolocationPosition);
    expect(gpsService.watchStats()).toMatchObject({ updates: 2, lastAcc: 6 });
    gpsService.stopTracking();
  });
});

describe("🔴 التوصيل", () => {
  it("الحساب ده في الصندوق الأسود (هو بس — مع اللي قبله)", () => {
    expect(DIAG_AGENT_IDS).toContain(AGENT);
  });
  it("Voice PRO بيكتب سطر لكل لوحة + نبضة المراقب — للصندوق الأسود بس", () => {
    const P = readFileSync(path.resolve(__dirname, "..", "app/(app)/registration-v2/page.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(P).toMatch(/if \(diagActive\(\)\) \{[\s\S]{0,300}diagNote\("gps-plate", gpsPlateDiag\(/);
    expect(P).toMatch(/diagNote\("gps-watch", gpsWatchDiag\(/);
  });
});
