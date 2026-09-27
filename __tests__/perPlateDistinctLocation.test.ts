import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 🔴 **كل لوحة تاخد لحظتها — حتى والقراءة بطيئة.**
 *
 * بلاغ مندوب آيفون (٢٧ سبتمبر ٢٠٢٦) على **Voice PRO**: الصوت بياخد نفس الموقع
 * لكل اللوحات، رغم إصلاح ٢٦ سبتمبر.
 *
 * سببان في نفس المسار، والاتنين بيضربوا على الآيفون تحديداً لأن
 * `requestLocation` بياخد ثواني:
 *
 *   ① الرجوع بعد الفشل كان `lastRaw ?? lastCoords` — بيفضّل قراءة **قديمة**
 *      على الفيكس الحي اللي المراقب بيحدّثه كل ثانية.
 *   ② الطلب الطاير كان بيتشارك: كل اللوحات اللي بتيجي أثناء قراءة واحدة
 *      بتستنى **نفس الوعد** ⇒ **نفس الإحداثيات بالحرف**. وبمهلة ٨ث وإيقاع
 *      نطق ~٣ث يبقى ٢-٣ لوحات في كل قراءة.
 *
 * الاختبار ده بيشغّل الحالتين فعلاً — مش فحص نصّي.
 */
describe("Voice PRO — لوحات متتالية والقراءة بطيئة", () => {
  let watchTick: (lat: number) => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("navigator", { geolocation: undefined });
    vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@capacitor/core");
    vi.doUnmock("@capacitor/geolocation");
  });

  it("🔴 قراءة بطيئة: اللوحة التانية والتالتة ماياخدوش نفس نقطة الأولى", async () => {
    // نداء أصلي **بطيء** (زي الآيفون) — بيفضل طاير ٥ ثواني.
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: () => new Promise(() => { /* عمره ما بيخلص في الاختبار */ }),
        watchPosition: async () => 1,
        clearWatch: async () => {},
      },
    }));

    const m = await import("@/lib/gps");
    m.__resetNativeCache();

    // المراقب شغّال وبيحدّث الموقع — زي الجهاز الحقيقي.
    const svc = m.gpsService as unknown as { lastCoords: unknown; lastRaw: unknown };
    watchTick = (lat: number) => { svc.lastCoords = { lat, lng: 46.8, accuracy: 8, timestamp: Date.now() }; };

    watchTick(24.001);
    const p1 = await m.gpsService.getFreshReading({ timeoutMs: 100 });

    await new Promise((r) => setTimeout(r, 5));
    watchTick(24.002);                                  // المندوب اتحرك
    const p2 = await m.gpsService.getFreshReading({ timeoutMs: 100 });

    await new Promise((r) => setTimeout(r, 5));
    watchTick(24.003);
    const p3 = await m.gpsService.getFreshReading({ timeoutMs: 100 });

    expect(p1?.lat).toBe(24.001);
    expect(p2?.lat).toBe(24.002);
    expect(p3?.lat).toBe(24.003);
    // البرهان المباشر على الشكوى:
    expect(new Set([p1?.lat, p2?.lat, p3?.lat]).size).toBe(3);
  });

  it("🔴 النداء الأصلي بيفشل: بيرجّع الفيكس الحي مش أقدم قراءة", async () => {
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: async () => { throw new Error("native timeout"); },
        watchPosition: async () => 1,
        clearWatch: async () => {},
      },
    }));

    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    const svc = m.gpsService as unknown as {
      lastCoords: { lat: number; lng: number; accuracy: number; timestamp: number } | null;
      lastRaw: { lat: number; lng: number; accuracy: number; timestamp: number } | null;
    };

    // قراءة **قديمة** ناجحة من زمان + فيكس **حي** من المراقب دلوقتي
    svc.lastRaw = { lat: 24.100, lng: 46.8, accuracy: 10, timestamp: Date.now() - 60_000 };
    svc.lastCoords = { lat: 24.900, lng: 46.8, accuracy: 8, timestamp: Date.now() };

    const fx = await m.gpsService.getFreshReading({ timeoutMs: 50, maxAgeMs: 0 });
    expect(fx?.lat).toBe(24.900);            // الحي، مش القديم
  });
});
