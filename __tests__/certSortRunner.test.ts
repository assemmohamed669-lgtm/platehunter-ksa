import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createSortRunner, withTimeout, TimeoutError } from "@/lib/sortRunner";

/**
 * 📄 «شهايد النهارده» — المناديب (١٧ أكتوبر ٢٠٢٦): «لما يجيلو اشعار الشهايد ويدخل … ييجي يفرز مش بيتفرز معاه لازم يخرج
 * من البرنامج ويفتح تاني او يقعد شوي». السبب: التحديث التلقائي بيفرز في الخلفية (من غير أي علامة)، ودوسة «فرز» وهو
 * شغّال كانت بترجع في صمت (`if (busyRef.current) return;`). المالك: «عايز ده يحصل في أسرع وقت».
 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => { resolve = r; });
  return { p, resolve };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("🔴 دوسة «فرز» والتحديث الخلفي شغّال", () => {
  it("مفيش حاجة شغّالة ⇒ بيفرز", async () => {
    const r = createSortRunner<number>();
    const job = vi.fn(async () => true);
    expect(await r.run(0, true, job)).toBe("ran");
    expect(job).toHaveBeenCalledTimes(1);
    expect(r.busy()).toBe(false);
  });
  it("تحديث تلقائي والفرز شغّال ⇒ مابيبدأش تاني", async () => {
    const r = createSortRunner<number>();
    const d = deferred<boolean>();
    const first = r.run(0, false, () => d.p);
    const job = vi.fn(async () => true);
    expect(await r.run(0, false, job)).toBe("skipped");
    expect(job).not.toHaveBeenCalled();
    d.resolve(true); await first;
  });
  it("🔴 الدوسة مابتضيعش: بتستنى التحديث الشغّال، ولو نجح لنفس اليوم نتيجته هي النتيجة (من غير فرز تاني)", async () => {
    const r = createSortRunner<number>();
    const d = deferred<boolean>();
    const bg = r.run(0, false, () => d.p);
    const job = vi.fn(async () => true);
    const joined = vi.fn();
    const press = r.run(0, true, job, joined);
    await tick();
    expect(joined).toHaveBeenCalledTimes(1);   // الزرار بيلف على طول
    expect(r.busy()).toBe(true);
    d.resolve(true);
    expect(await press).toBe("joined");
    expect(job).not.toHaveBeenCalled();
    await bg;
  });
  it("التحديث الشغّال فشل ⇒ الدوسة بتفرز بنفسها", async () => {
    const r = createSortRunner<number>();
    const d = deferred<boolean>();
    const bg = r.run(0, false, () => d.p);
    const job = vi.fn(async () => true);
    const press = r.run(0, true, job);
    d.resolve(false);
    expect(await press).toBe("ran");
    expect(job).toHaveBeenCalledTimes(1);
    await bg;
  });
  it("التحديث الشغّال ليوم تاني ⇒ بعد ما يخلص بيفرز اليوم المختار", async () => {
    const r = createSortRunner<number>();
    const d = deferred<boolean>();
    const bg = r.run(0, false, () => d.p);
    const job = vi.fn(async () => true);
    const press = r.run(2, true, job);
    d.resolve(true);
    expect(await press).toBe("ran");
    expect(job).toHaveBeenCalledTimes(1);
    await bg;
  });
  it("الفرز رمى غلط ⇒ القفل بيتفك", async () => {
    const r = createSortRunner<number>();
    await r.run(0, true, async () => { throw new Error("x"); });
    expect(r.busy()).toBe(false);
  });
});

describe("🔴 النت لو علّق القفل مايفضلش مقفول", () => {
  it("بيرجع القيمة لو جت بدري", async () => {
    expect(await withTimeout(Promise.resolve(5), 50)).toBe(5);
  });
  it("بيرمي TimeoutError لو الطلب علّق", async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("🔴 توصيل «شهايد النهارده»", () => {
  const C = readFileSync(path.resolve(__dirname, "..", "components/DailyCertSort.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("الدوسة مابترجعش في صمت لو فيه فرز شغّال", () => {
    expect(C).not.toMatch(/if \(busyRef\.current\) return;/);
    expect(C).toMatch(/runnerRef\.current\.run\(off, !silent,/);
  });
  it("التحديث الخلفي باين للمندوب", () => {
    expect(C).toMatch(/بيتحدّث بالشهايد الجديدة/);
  });
  it("طلبات النت ليها حد أقصى", () => {
    expect(C).toMatch(/withTimeout\(supabase\.auth\.getSession\(\), /);
    expect(C).toMatch(/signal: ctrl\.signal/);
    expect(C).toMatch(/teamState: async \(\) => \{\n\s+const s = await withTimeout\(fetchTeamDataState\(\), /);
  });
});
