import { describe, it, expect, vi } from "vitest";
import { clearNativeCache, type NativeCacheBridge } from "@/lib/nativeCache";

/**
 * زر «تحديث البرنامج» على الأندرويد لازم يمسح **كاش التطبيق الحقيقي** كمان —
 * ده اللي كنا بنقول للمندوب يمسحه بإيده من إعدادات التليفون.
 *
 * الجافاسكريبت لوحده مايقدرش (مافيش صفحة ويب بتمسح كاش المتصفح). لكن على
 * الأندرويد إحنا عاملين القشرة بنفسنا (Capacitor)، فبنعرّض دالة أصلية واحدة
 * بتمسح وتعيد التحميل.
 *
 * الجسر ده **موجود على الأندرويد بس**: على الآيفون والمتصفح العادي مش موجود،
 * فلازم الكود يكمّل بطريقته العادية بدل ما يقع.
 */
describe("clearNativeCache — الجسر للأصلي على الأندرويد", () => {
  it("بينادي الأصلي بالرابط ويرجّع true (الأصلي هيعيد التحميل)", () => {
    const bridge: NativeCacheBridge = { clearCacheAndReload: vi.fn() };
    const url = "https://platehunter-ksa.vercel.app/?_r=123";
    expect(clearNativeCache(bridge, url)).toBe(true);
    expect(bridge.clearCacheAndReload).toHaveBeenCalledWith(url);
  });

  it("🔌 مافيش جسر (آيفون/متصفح) → false والكود بيكمّل عادي", () => {
    expect(clearNativeCache(undefined, "https://x/")).toBe(false);
    expect(clearNativeCache(null, "https://x/")).toBe(false);
  });

  it("جسر ناقص الدالة (نسخة APK قديمة) → false مش كراش", () => {
    expect(clearNativeCache({} as NativeCacheBridge, "https://x/")).toBe(false);
  });

  it("الأصلي رمى استثناء → false، والكود بيكمّل بالطريقة العادية", () => {
    const bridge: NativeCacheBridge = {
      clearCacheAndReload: vi.fn(() => { throw new Error("bridge died"); }),
    };
    expect(clearNativeCache(bridge, "https://x/")).toBe(false);
  });
});
