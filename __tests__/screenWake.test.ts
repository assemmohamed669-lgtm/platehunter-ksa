import { describe, it, expect, vi } from "vitest";
import { createScreenWake, type WakeLockLike, type WakeLockSentinelLike } from "@/lib/screenWake";

/**
 * مندوب بيبدأ تسجيل صوتي، وبعد شوية شاشة التليفون بتطفي لوحدها (مهلة الشاشة
 * العادية) — والتسجيل بيقف معاه.
 *
 * السبب في تطبيقنا: الحارس اللي بيفصل المايك أول ما التطبيق يروح للخلفية
 * (`visibilitychange → hidden`). أندرويد بيعتبر **إطفاء الشاشة** إخفاء للصفحة،
 * فنفس الحارس اللي المفروض يسيب الميك لمكالمة جاية بيوقف التسجيل لما الشاشة
 * تنام لوحدها.
 *
 * الحل: قفل شاشة (Screen Wake Lock) طول التسجيل — الشاشة ماتنامش أصلاً فمافيش
 * إخفاء ومافيش وقف. المدير هنا نقي وبيتحقن بالـAPI عشان يتقاس، ولأن الـAPI دي
 * مش موجودة على كل ويب-ڤيو (لازم تفضل اختيارية مش شرط للتسجيل).
 */
function fakeSentinel(): WakeLockSentinelLike & { released: boolean } {
  const listeners: Array<() => void> = [];
  return {
    released: false,
    release: vi.fn(async function (this: { released: boolean }) { this.released = true; }),
    addEventListener: (_t: string, fn: () => void) => { listeners.push(fn); },
    // للاختبار: نحاكي إن النظام سحب القفل
    _fireRelease: () => listeners.forEach((f) => f()),
  } as never;
}

function fakeApi() {
  const sentinels: ReturnType<typeof fakeSentinel>[] = [];
  const api: WakeLockLike = {
    request: vi.fn(async () => {
      const s = fakeSentinel();
      sentinels.push(s);
      return s;
    }),
  };
  return { api, sentinels };
}

describe("createScreenWake — قفل الشاشة أثناء التسجيل", () => {
  it("بياخد القفل مرة واحدة بس مهما ناديت", async () => {
    const { api } = fakeApi();
    const w = createScreenWake(() => api);
    await w.acquire();
    await w.acquire();
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(w.isHeld()).toBe(true);
  });

  it("بيسيب القفل ويقدر ياخده تاني", async () => {
    const { api, sentinels } = fakeApi();
    const w = createScreenWake(() => api);
    await w.acquire();
    await w.release();
    expect(sentinels[0].release).toHaveBeenCalled();
    expect(w.isHeld()).toBe(false);

    await w.acquire();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it("🔴 الأهم: غياب الـAPI مايكسرش التسجيل — بيعدّي بهدوء", async () => {
    const w = createScreenWake(() => undefined);
    await expect(w.acquire()).resolves.toBeUndefined();
    await expect(w.release()).resolves.toBeUndefined();
    expect(w.isHeld()).toBe(false);
  });

  it("فشل الطلب (المستخدم رافض / بطارية ضعيفة) مايرميش استثناء", async () => {
    const api: WakeLockLike = { request: vi.fn(async () => { throw new Error("NotAllowedError"); }) };
    const w = createScreenWake(() => api);
    await expect(w.acquire()).resolves.toBeUndefined();
    expect(w.isHeld()).toBe(false);
  });

  it("لو النظام سحب القفل، المدير بيعرف إنه مابقاش ماسك", async () => {
    const { api, sentinels } = fakeApi();
    const w = createScreenWake(() => api);
    await w.acquire();
    (sentinels[0] as unknown as { _fireRelease: () => void })._fireRelease();
    expect(w.isHeld()).toBe(false);
  });

  it("بعد ما النظام يسحبه، إعادة الطلب بتاخد قفل جديد", async () => {
    const { api, sentinels } = fakeApi();
    const w = createScreenWake(() => api);
    await w.acquire();
    (sentinels[0] as unknown as { _fireRelease: () => void })._fireRelease();
    await w.acquire();
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(w.isHeld()).toBe(true);
  });

  it("release من غير acquire مايكسرش", async () => {
    const { api } = fakeApi();
    const w = createScreenWake(() => api);
    await expect(w.release()).resolves.toBeUndefined();
    expect(api.request).not.toHaveBeenCalled();
  });
});
