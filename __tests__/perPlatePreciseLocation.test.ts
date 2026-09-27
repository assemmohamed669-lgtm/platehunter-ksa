import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 🔴 **قاعدة المالك (٢٧ سبتمبر ٢٠٢٦):**
 *
 *     «كل سيارة يبقى ليها موقع دقيق ليها — مش نفس الموقع على كل اللوحات،
 *      كل لوحة ليها موقعها الخاص بيها ويكون دقيق.»
 *
 * شرطان، والاتنين لازم يتحققوا مع بعض:
 *   ① **مميّز**  — لوحتين ورا بعض ماياخدوش نفس النقطة
 *   ② **دقيق**   — ومايتقبلش فيكس خشن (شبكة/واي-فاي) عشان بس هو «حديث»
 *
 * التمييز وحده مايكفّيش: فيكس عمره نص ثانية بدقة ٢٠٠ متر بيدّي كل لوحة نقطة
 * «مختلفة» بس كلها غلط.
 */
type Fix = { lat: number; lng: number; accuracy: number; timestamp: number };

describe("كل لوحة: موقع خاص بيها + دقيق", () => {
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

  it("🔴 ① مميّز: ٣ لوحات ورا بعض ⇒ ٣ نقط مختلفة", async () => {
    // قراءة أصلية **بطيئة** زي الآيفون — بتفضل طايرة
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: () => new Promise(() => { /* بطيئة */ }),
        watchPosition: async () => 1,
        clearWatch: async () => {},
      },
    }));
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };

    const out: (number | undefined)[] = [];
    for (const lat of [24.001, 24.002, 24.003]) {
      svc.lastCoords = { lat, lng: 46.8, accuracy: 8, timestamp: Date.now() };   // المراقب بيتحرك
      out.push((await m.gpsService.getFreshReading({ timeoutMs: 80 }))?.lat);
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(out).toEqual([24.001, 24.002, 24.003]);
    expect(new Set(out).size).toBe(3);
  });

  it("🔴 ② دقيق: فيكس حديث بس خشن (٢٠٠م) مايتقبلش — بيتطلب واحد جديد", async () => {
    let asked = 0;
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: async () => {
          asked++;
          return { coords: { latitude: 24.5, longitude: 46.5, accuracy: 6 }, timestamp: Date.now() };
        },
        watchPosition: async () => 1,
        clearWatch: async () => {},
      },
    }));
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };

    // حديث جداً (دلوقتي) لكن دقته ٢٠٠ متر — شبكة/واي-فاي جوّه مبنى
    svc.lastCoords = { lat: 24.111, lng: 46.111, accuracy: 200, timestamp: Date.now() };
    svc.lastRaw = null;

    const fx = await m.gpsService.getFreshReading({ timeoutMs: 200 });
    expect(asked).toBe(1);                 // ماقبلناش الخشن — طلبنا أقمار
    expect(fx?.accuracy).toBe(6);
    expect(fx?.lat).toBe(24.5);
  });

  it("والفيكس الحديث **والدقيق** يتقبل على طول — بلا طلب زيادة", async () => {
    let asked = 0;
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: async () => { asked++; throw new Error("مالزمش"); },
        watchPosition: async () => 1,
        clearWatch: async () => {},
      },
    }));
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };

    svc.lastCoords = { lat: 24.7, lng: 46.7, accuracy: 9, timestamp: Date.now() };
    svc.lastRaw = null;

    const fx = await m.gpsService.getFreshReading({ timeoutMs: 200 });
    expect(asked).toBe(0);                 // مافيش طلب — الموجود كفاية
    expect(fx?.lat).toBe(24.7);
  });

  it("🔴 اللوحات في نفس اللحظة (< ٩٠٠ مللي) بتتشارك قراءة — مافيش طوفان طلبات", async () => {
    let asked = 0;
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: async () => {
          asked++;
          await new Promise((r) => setTimeout(r, 30));
          return { coords: { latitude: 24.4, longitude: 46.4, accuracy: 7 }, timestamp: Date.now() };
        },
        watchPosition: async () => 1,
        clearWatch: async () => {},
      },
    }));
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };
    svc.lastCoords = null; svc.lastRaw = null;

    // ٥ لوحات في نفس الملّي ثانية = نفس المكان فعلاً
    await Promise.all([1, 2, 3, 4, 5].map(() => m.gpsService.getFreshReading({ timeoutMs: 200 })));
    expect(asked).toBe(1);
  });
});
