import { describe, it, expect, vi, afterEach } from "vitest";
import { startGpsAutoRefresh, GPS_AUTO_REFRESH_MS } from "@/lib/gpsAutoRefresh";

/**
 * 📍 المالك (٢٤ سبتمبر): «عايز الجي بي اس يعمل تحديث لنفسه كل ٣ ثواني» — صفحة «الجديد».
 * نفس زرار «تحديث» اللي المندوب بيدوسه بإيده، بس لوحده — ومن غير ما الطلبات تتراكم لو
 * الإشارة ضعيفة (القراية ممكن تاخد أكتر من ٣ ثواني).
 */
describe("startGpsAutoRefresh", () => {
  afterEach(() => { vi.useRealTimers(); });

  it(`🔴 بيطلب قراية جديدة كل ${GPS_AUTO_REFRESH_MS / 1000} ثواني ويبلّغ بيها`, async () => {
    vi.useFakeTimers();
    const got: number[] = [];
    let n = 0;
    const stop = startGpsAutoRefresh({ getFix: async () => ({ lat: 1, lng: 2, accuracy: 5, timestamp: ++n }), onFix: (c) => got.push(c.timestamp) });
    await vi.advanceTimersByTimeAsync(GPS_AUTO_REFRESH_MS * 3 + 10);
    expect(got).toEqual([1, 2, 3]);
    stop();
  });

  it("🔴 القراية لو طوّلت (إشارة ضعيفة) ⇒ مفيش طلب تاني فوقها", async () => {
    vi.useFakeTimers();
    let calls = 0; let release: (() => void) | null = null;
    const stop = startGpsAutoRefresh({
      getFix: () => { calls++; return new Promise((r) => { release = () => r({ lat: 1, lng: 2, accuracy: 5, timestamp: 1 }); }); },
      onFix: () => {},
    });
    await vi.advanceTimersByTimeAsync(GPS_AUTO_REFRESH_MS * 4);
    expect(calls).toBe(1);                       // لسه مستنية الأولى
    release!();
    await vi.advanceTimersByTimeAsync(GPS_AUTO_REFRESH_MS + 10);
    expect(calls).toBe(2);
    stop();
  });

  it("فشل القراية (رفض/شبكة) ⇒ مابيوقفش ومابيبلّغش بحاجة", async () => {
    vi.useFakeTimers();
    let calls = 0; const got: unknown[] = [];
    const stop = startGpsAutoRefresh({ getFix: async () => { calls++; if (calls === 1) throw new Error("x"); return null; }, onFix: (c) => got.push(c) });
    await vi.advanceTimersByTimeAsync(GPS_AUTO_REFRESH_MS * 2 + 10);
    expect(calls).toBe(2);
    expect(got).toEqual([]);
    stop();
  });

  it("stop ⇒ ولا طلب بعدها", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const stop = startGpsAutoRefresh({ getFix: async () => { calls++; return null; }, onFix: () => {} });
    await vi.advanceTimersByTimeAsync(GPS_AUTO_REFRESH_MS + 10);
    stop();
    await vi.advanceTimersByTimeAsync(GPS_AUTO_REFRESH_MS * 5);
    expect(calls).toBe(1);
  });
});
