import { describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return await import("./appForeground");
}

describe("التطبيق قدام المندوب ولا في الخلفية (مش بس رأي الصفحة)", () => {
  it("في الخلفية ⇒ الصفحة «مستخبية» حتى لو المتصفح بيقول «ظاهرة» (أندرويد 1.8 والتسجيل شغّال)", async () => {
    const fg = await load();
    expect(document.visibilityState).toBe("visible");
    expect(fg.pageVisibility()).toBe("visible");
    fg.setAppActive(false, 1000);
    expect(fg.appInBackground()).toBe(true);
    expect(fg.pageVisibility()).toBe("hidden");
    fg.setAppActive(true, 2000);
    expect(fg.pageVisibility()).toBe("visible");
  });

  it("`appAwaySince(t)`: في الخلفية دلوقتي، أو رجع/راح بعد `t` ⇒ الفجوة دي مش تهنيج", async () => {
    const fg = await load();
    expect(fg.appAwaySince(500)).toBe(false);
    fg.setAppActive(false, 1000);
    expect(fg.appAwaySince(5000)).toBe(true);    // لسه في الخلفية
    fg.setAppActive(true, 9000);
    expect(fg.appAwaySince(8000)).toBe(true);    // الفجوة من ٨٠٠٠ فيها رجوع
    expect(fg.appAwaySince(9500)).toBe(false);   // فجوة بعد الرجوع = تهنيج حقيقي
  });

  it("المستمعين بيتبلّغوا بالتغيير بس، ولما يتشالوا يسكتوا", async () => {
    const fg = await load();
    const cb = vi.fn();
    const off = fg.onAppState(cb);
    fg.setAppActive(false);
    fg.setAppActive(false);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(false);
    off();
    fg.setAppActive(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("مستمع بيرمي مايوقّفش الباقيين", async () => {
    const fg = await load();
    const ok = vi.fn();
    fg.onAppState(() => { throw new Error("x"); });
    fg.onAppState(ok);
    fg.setAppActive(false);
    expect(ok).toHaveBeenCalledWith(false);
  });
});
