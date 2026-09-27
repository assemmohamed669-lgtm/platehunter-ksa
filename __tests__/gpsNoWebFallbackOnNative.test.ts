import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
 * 🔴 **`navigator.geolocation` ليها مكان واحد بس: `lib/gps.ts`.**
 *
 * أي صفحة أو مكوّن بينده الواجهة دي **مباشرةً** بيتخطّى فحص المنصّة — فعلى
 * آيفون بتطلع رسالة إذن الموقع للموقع الإلكتروني جوّه التطبيق.
 *
 * ⚠️ ده كان حاصل في **٣ أماكن** («الأقرب» في الفرز، وجدولَي السجلات والمطلوب)
 *    بعد ما `lib/gps.ts` اتصلّحت — يعني الإصلاح كان **ناقص** من غير الحارس ده.
 */
describe("نداء الموقع مركزي — مافيش نداء مباشر بره lib/gps.ts", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("🔴 الوحيد اللي بينده navigator.geolocation هو lib/gps.ts", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of ["app", "components", "lib"]) {
      for (const f of walk(join(process.cwd(), root))) {
        scanned++;
        const rel = f.replace(process.cwd(), "").split("\\").join("/");
        if (rel.endsWith("/lib/gps.ts")) continue;            // المكان المسموح الوحيد
        // ⚠️ الكود بلا تعليقات — التعليقات بتذكر الاسم عشان توثّق الحادثة،
        //    فالبحث الخام بيمسك نفسه ويفشل بالغلط (حصل فعلاً وإحنا بنكتبه).
        const body = readFileSync(f, "utf8")
          .split(/\r?\n/)
          .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
          .join("\n");
        if (body.includes("navigator.geolocation")) offenders.push(rel);
      }
    }
    expect(scanned).toBeGreaterThan(50);                       // الحارس فحص فعلاً
    expect(offenders).toEqual([]);
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
    vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
    // النداء الأصلي بيرمي — نفس حالة المهلة/القفلة الباردة
    vi.doMock("@capacitor/geolocation", () => ({
      Geolocation: {
        requestPermissions: async () => ({ location: "granted" }),
        getCurrentPosition: async () => { throw new Error("native timeout"); },
        watchPosition: async () => { throw new Error("native watch failed"); },
        clearWatch: async () => {},
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@capacitor/core");
    vi.doUnmock("@capacitor/geolocation");
  });

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
