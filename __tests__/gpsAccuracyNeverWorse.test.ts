import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 🔴 **حاجز الدقة لازم يشتغل على القراءة الراجعة كمان — مش على المخزّن بس.**
 *
 * المراجعة العدائية (٢٧ سبتمبر ٢٠٢٦) قاست تراجع حقيقي في أول نسخة من الإصلاح:
 * الحاجز كان بيرفض الفيكس الدافي لو دقته أوحش من الحد، وبعدين بيرجّع القراءة
 * الجديدة **بلا أي فحص**. فالنتيجة كانت **عكس** المطلوب:
 *
 *     المندوب في جراج · المراقب ماسك قفلة أقمار ٨م عمرها ١.٢ث
 *     القراءة الجديدة بتقع على الشبكة وترجع ١٢٠م
 *     ⇒ اللوحة بتتختم على ١٢٠م، بينما المسار القديم كان بيختمها على ٨م
 *
 * وده بيكسر قاعدة المالك «كل سيارة ليها موقع دقيق ليها» بالحرف.
 *
 * وكمان: المشاركة المحدودة بالوقت فتحت احتمال **قراءتين طايرتين**، والأبطأ
 * ممكن تخلص آخر وهي شايلة موقع **أقدم** فتكتب فوق الأحدث.
 */
type Fix = { lat: number; lng: number; accuracy: number; timestamp: number };

describe("الدقة ماتقلّش عن المتاح", () => {
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

  async function svcWith(getPos: () => Promise<{ coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }>) {
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: getPos,
        watchPosition: async () => 1,
        clearWatch: async () => {},
      },
    }));
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    return m;
  }

  it("🔴 قفلة أقمار ٨م عمرها ١.٢ث + قراءة شبكة ١٢٠م ⇒ بترجّع الـ٨م مش الـ١٢٠م", async () => {
    const m = await svcWith(async () => ({
      coords: { latitude: 24.999, longitude: 46.999, accuracy: 120 }, timestamp: Date.now(),
    }));
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };
    svc.lastRaw = null;
    svc.lastCoords = { lat: 24.500, lng: 46.500, accuracy: 8, timestamp: Date.now() - 1200 };

    const fx = await m.gpsService.getFreshReading({ timeoutMs: 200 });
    expect(fx?.accuracy).toBe(8);
    expect(fx?.lat).toBe(24.500);
  });

  it("والقراءة الجديدة بتكسب لو هي الأدق", async () => {
    const m = await svcWith(async () => ({
      coords: { latitude: 24.999, longitude: 46.999, accuracy: 5 }, timestamp: Date.now(),
    }));
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };
    svc.lastRaw = null;
    svc.lastCoords = { lat: 24.500, lng: 46.500, accuracy: 30, timestamp: Date.now() - 1200 };

    const fx = await m.gpsService.getFreshReading({ timeoutMs: 200 });
    expect(fx?.accuracy).toBe(5);
    expect(fx?.lat).toBe(24.999);
  });

  it("الدافي البايت (> ١٠ث) مابيغلبش القراءة الجديدة حتى لو أدق", async () => {
    // المندوب اتحرك من ساعتها — الدقة القديمة مالهاش قيمة.
    const m = await svcWith(async () => ({
      coords: { latitude: 24.999, longitude: 46.999, accuracy: 120 }, timestamp: Date.now(),
    }));
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };
    svc.lastRaw = null;
    svc.lastCoords = { lat: 24.500, lng: 46.500, accuracy: 8, timestamp: Date.now() - 30_000 };

    const fx = await m.gpsService.getFreshReading({ timeoutMs: 200 });
    expect(fx?.accuracy).toBe(120);
  });

  it("🔴 قراءة أقدم بتخلص متأخّرة مابتكتبش فوق الأحدث", async () => {
    // قراءتان طايرتان: البطيئة شايلة موقع أقدم وبتخلص آخر.
    let n = 0;
    const m = await svcWith(async () => {
      n++;
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 40));
        return { coords: { latitude: 24.100, longitude: 46.1, accuracy: 10 }, timestamp: Date.now() - 3000 };
      }
      return { coords: { latitude: 24.900, longitude: 46.9, accuracy: 10 }, timestamp: Date.now() };
    });
    const svc = m.gpsService as unknown as { lastCoords: Fix | null; lastRaw: Fix | null };
    svc.lastRaw = null; svc.lastCoords = null;

    const slow = m.gpsService.getFreshReading({ timeoutMs: 300, maxAgeMs: 0 });
    await new Promise((r) => setTimeout(r, 5));
    await m.gpsService.getFreshReading({ timeoutMs: 300, maxAgeMs: 0 });   // الأحدث
    await slow;                                                            // الأقدم بتخلص بعدها

    // قراءة بصبّة جديدة — الإسناد فوق ضيّق نوع `svc.lastRaw` لـ`null`.
    // ⚠️ بنفحص `lastRaw` تحديداً: `getLastCoords()` بتمرّ على `pickBetterFix`
    //    وهي قاعدة تانية (وسلوكها القديم على `main` مش جزء من الدفعة دي).
    const after = (m.gpsService as unknown as { lastRaw: Fix | null }).lastRaw;
    expect(after?.lat).toBe(24.900);     // الأحدث صمد، والأقدم مكتبش فوقه
  });
});
