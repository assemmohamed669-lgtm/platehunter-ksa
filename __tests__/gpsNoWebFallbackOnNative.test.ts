import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 **على الجهاز: مايتندهش `navigator.geolocation` أبداً.**
 *
 * بلاغ المالك (٢٧ سبتمبر ٢٠٢٦، صورة شاشة): وسط شغل المندوب بتطلع رسالة
 * «platehunter-ksa.vercel.app would like to use your current location»،
 * والرسالة نفسها بتقول إن **«قناص اللوحات» واخد الإذن خلاص**.
 *
 * يعني الإذن الأصلي موجود، واللي بيتطلب هو إذن الموقع **للموقع الإلكتروني**
 * جوّه الـWebView — وهو إذن منفصل على آيفون. ومصدره الوحيد هو
 * `navigator.geolocation`، اللي كان بيتنده لما نداء الموقع الأصلي يفشل.
 */
describe("الموقع — مافيش سقوط على الويب جوّه التطبيق", () => {
  const src = readFileSync(join(process.cwd(), "lib", "gps.ts"), "utf8").replace(/\r\n/g, "\n");
  const code = src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("الحارس بيقرا الملف فعلاً", () => {
    expect(code).toContain("navigator.geolocation");
    expect(code).toContain("isNativeApp");
  });

  it("🔴 `isNativePlatform()` بيتنده في مكان واحد بس — جوّه `isNativeApp`", () => {
    // النمط القديم: try { if (isNativePlatform()) {…} } catch {} ثم كود الويب.
    // دلوقتي الفحص مركزي، فأي نداء تاني معناه إن النمط القديم رجع في مكان ما.
    const hits = code.split("Capacitor.isNativePlatform()").length - 1;
    expect(hits).toBe(1);
    // والنداء الوحيد ده لازم يكون جوّه الدالة المركزية.
    const fnStart = code.indexOf("export async function isNativeApp");
    const fnEnd = code.indexOf("export function __resetNativeCache");
    const call = code.indexOf("Capacitor.isNativePlatform()");
    expect(fnStart).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(fnStart);
    expect(call).toBeLessThan(fnEnd);
  });

  it("🔴 كل فرع أصلي بيتحدّد بـ`await isNativeApp()` بره الـtry", () => {
    const n = code.split("await isNativeApp()").length - 1;
    expect(n).toBeGreaterThanOrEqual(4);   // startTracking · getFreshFix · getFreshReading · pinCurrentLocation
  });
});

/**
 * الإثبات الحقيقي: نشغّل الكود وإحنا مدّعيين إننا على الجهاز والنداء الأصلي
 * بيرمي — ونتأكد إن `navigator.geolocation` **مااتندهش ولا مرة**.
 */
describe("تشغيل فعلي — الأصلي بيفشل، الويب مايتندهش", () => {
  const webSpy = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    webSpy.mockClear();
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) => {
          webSpy();                        // ← ده اللي بيطلّع رسالة الإذن
          err(new Error("web geolocation"));
        },
        watchPosition: () => { webSpy(); return 1; },
        clearWatch: () => {},
      },
    });
    vi.stubGlobal("window", globalThis);
    // على الجهاز
    vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
    // والنداء الأصلي بيرمي — نفس حالة المهلة/القفلة الباردة
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: async () => { throw new Error("native timeout"); },
        watchPosition: async () => { throw new Error("native watch failed"); },
        clearWatch: async () => {},
      },
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock("@capacitor/core"); vi.doUnmock("@capacitor/geolocation"); });

  it("🔴 getFreshReading: الأصلي رمى ⇒ صفر نداء للويب", async () => {
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    await m.gpsService.getFreshReading({ timeoutMs: 50 });
    expect(webSpy).not.toHaveBeenCalled();
  });

  it("🔴 getFreshFix: الأصلي رمى ⇒ صفر نداء للويب", async () => {
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    await m.gpsService.getFreshFix({ timeoutMs: 50 });
    expect(webSpy).not.toHaveBeenCalled();
  });

  it("🔴 pinCurrentLocation: الأصلي رمى ⇒ صفر نداء للويب", async () => {
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    await m.gpsService.pinCurrentLocation().catch(() => { /* متوقّع */ });
    expect(webSpy).not.toHaveBeenCalled();
  });

  it("🔴 startTracking: الأصلي رمى ⇒ صفر نداء للويب", async () => {
    const m = await import("@/lib/gps");
    m.__resetNativeCache();
    await m.gpsService.startTracking();
    expect(webSpy).not.toHaveBeenCalled();
  });
});
