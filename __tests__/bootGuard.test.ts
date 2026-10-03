import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  bootGuard, markBootStable, takeBootGuardHit, pageLabel,
  BOOT_GUARD_KEY, BOOT_GUARD_SCRIPT, BOOT_STABLE_MS,
} from "@/lib/bootGuard";

/**
 * 🔁 **مافيش صفحة تحبس المندوب في لفّة.**
 *
 * المالك (٣ أكتوبر ٢٠٢٦): آيفون ١١ «يجيبلو جاري التحقق… يفتح… جاري التحقق… لحد ما
 * الصفحة تعمل فريز وتهنج». الصفحة بتقع (ذاكرة) ⇒ الموبايل بيحمّلها **هي نفسها** تاني
 * (والبرنامج بيفتح على آخر صفحة من #340) ⇒ تقع تاني… فالمندوب محبوس.
 *
 * سكربت صغير في أول الـHTML (قبل أي كود تاني) بيعدّ تحميلات نفس الصفحة اللي ماثبتتش
 * (ماعاشتش ٣٠ ثانية). التالتة ورا بعض ⇒ على «التشييك» (أو «المساعدة» لو التشييك هي اللي
 * بتلفّ)، والصفحة بتقول للمندوب حصل إيه.
 */

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
let store: MemStorage;
const S = () => store as unknown as Storage;
beforeEach(() => { store = new MemStorage(); });

describe("bootGuard — العدّ والتحويل", () => {
  it("🔴 تالت تحميل ورا بعض لنفس الصفحة من غير ما تثبت ⇒ على التشييك", () => {
    expect(bootGuard("/registration-v2", S(), 1_000)).toBeNull();
    expect(bootGuard("/registration-v2", S(), 9_000)).toBeNull();
    expect(bootGuard("/registration-v2", S(), 17_000)).toBe("/instant-check");
    expect(takeBootGuardHit(S())).toBe("/registration-v2");
    expect(takeBootGuardHit(S())).toBeNull();   // بيتقال مرة واحدة
  });

  it("بعد التحويل صفحة التشييك بتبدأ عدّ جديد (مابتتحوّلش هي كمان)", () => {
    for (const t of [0, 5_000, 10_000]) bootGuard("/registration-v2", S(), t);
    expect(bootGuard("/instant-check", S(), 11_000)).toBeNull();
    expect(bootGuard("/instant-check", S(), 12_000)).toBeNull();
  });

  it("التشييك نفسها هي اللي بتلفّ ⇒ على المساعدة", () => {
    for (const t of [0, 5_000]) expect(bootGuard("/instant-check", S(), t)).toBeNull();
    expect(bootGuard("/instant-check", S(), 10_000)).toBe("/help");
  });

  it("🔴 الصفحة عاشت ٣٠ ثانية (ثبتت) ⇒ التحميل الجاي بيبدأ من الأول — تحديث عادي مايحوّلش", () => {
    bootGuard("/sorting", S(), 0);
    markBootStable(S());
    bootGuard("/sorting", S(), 40_000);
    markBootStable(S());
    expect(bootGuard("/sorting", S(), 80_000)).toBeNull();
    expect(BOOT_STABLE_MS).toBe(30_000);
  });

  it("تحميلات متباعدة (أكتر من دقيقة ونص) مابتتعدّش لفّة", () => {
    expect(bootGuard("/wanted", S(), 0)).toBeNull();
    expect(bootGuard("/wanted", S(), 100_000)).toBeNull();
    expect(bootGuard("/wanted", S(), 200_000)).toBeNull();
  });

  it("صفحات مختلفة مابتتعدّش مع بعض", () => {
    expect(bootGuard("/sorting", S(), 0)).toBeNull();
    expect(bootGuard("/wanted", S(), 1_000)).toBeNull();
    expect(bootGuard("/sorting", S(), 2_000)).toBeNull();
  });

  it("شاشة البداية والدخول برّه الحساب خالص", () => {
    for (const p of ["/", "/login", "/auth/reset-password", "/admin"]) {
      expect(bootGuard(p, S(), 0)).toBeNull();
    }
    expect(store.getItem(BOOT_GUARD_KEY)).toBeNull();
  });

  it("تخزين بايظ أو مقفول مايوقّعش البرنامج", () => {
    store.setItem(BOOT_GUARD_KEY, "{not json");
    expect(bootGuard("/sorting", S(), 0)).toBeNull();
    const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } as unknown as Storage;
    expect(bootGuard("/sorting", broken, 0)).toBeNull();
    expect(() => markBootStable(broken)).not.toThrow();
    expect(takeBootGuardHit(broken)).toBeNull();
  });

  it("اسم الصفحة للمندوب", () => {
    expect(pageLabel("/registration-v2")).toBe("الجديد");
    expect(pageLabel("/data-upload")).toBe("رفع داتا");
    expect(pageLabel("/sorting")).toBe("الفرز");
  });
});

describe("🔴 السكربت اللي في أول الـHTML (مكتفي بنفسه)", () => {
  it("بيشتغل لوحده من غير أي استيراد ويحوّل في التحميل التالت", () => {
    const replace = vi.fn();
    const run = (t: number) => {
      const fakeDate = { now: () => t };
      new Function("location", "localStorage", "Date", BOOT_GUARD_SCRIPT)(
        { pathname: "/registration-v2", replace }, store, fakeDate,
      );
    };
    run(0); run(6_000);
    expect(replace).not.toHaveBeenCalled();
    run(12_000);
    expect(replace).toHaveBeenCalledWith("/instant-check");
  });

  it("أي رمية جوّه السكربت مابتوقّفش تحميل الصفحة", () => {
    const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
    expect(() => new Function("location", "localStorage", "Date", BOOT_GUARD_SCRIPT)(
      { pathname: "/sorting", replace: () => {} }, broken, Date,
    )).not.toThrow();
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  it("السكربت في أول الـbody في الـlayout الرئيسي — قبل أي مكوّن", () => {
    const root = read("app/layout.tsx");
    expect(root).toMatch(/import \{ BOOT_GUARD_SCRIPT \} from "@\/lib\/bootGuard";/);
    const body = root.indexOf("<body>");
    const script = root.indexOf("dangerouslySetInnerHTML={{ __html: BOOT_GUARD_SCRIPT }}");
    expect(script).toBeGreaterThan(body);
    expect(script).toBeLessThan(root.indexOf("<PlatformClass />"));
  });
  it("صفحات الحساب بتعلّم «ثبتت» بعد ٣٠ ثانية، وبتقول للمندوب لو اتحوّل", () => {
    const app = read("app/(app)/layout.tsx");
    expect(app).toMatch(/setTimeout\(\(\) => markBootStable\(localStorage\), BOOT_STABLE_MS\)/);
    expect(app).toMatch(/takeBootGuardHit\(localStorage\)/);
    expect(app).toMatch(/كانت بتقفل البرنامج/);
  });
});
