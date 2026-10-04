import { describe, it, expect } from "vitest";
import { certStatsTick, FULL_EVERY_MS, type JobState, type JobDeps } from "@/lib/certStatsJob";
import { stepFromPage, plateOf, type StatFile, type CountTask } from "@/lib/certStats";

/**
 * 📊 إحصائيات الشهايد — **الدورة على السيرفر** (كل دقيقة). المالك (٤ أكتوبر ٢٠٢٦): العدّ من
 * الموبايل قعد ربع ساعة وعدّى ٦٠٠ ألف ملف ⇒ السيرفر بيعدّ لوحده في الخلفية وبيحفظ، والصفحة
 * بتفتح على طول بآخر نتيجة.
 */

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function fakeStore(initial: JobState = {}) {
  let state: JobState = clone(initial);
  let locked = false;
  const writes = { save: 0, release: 0 };
  return {
    lock: async () => { if (locked) return null; locked = true; return clone(state); },
    save: async (st: JobState) => { state = clone(st); locked = false; writes.save++; },
    release: async () => { locked = false; writes.release++; },
    get: () => state,
    setLocked: (v: boolean) => { locked = v; },
    writes,
  };
}

function fakePlates() {
  const plates = new Map<string, number>();
  const by = new Map<string, number>();
  return {
    upsert: async (pass: number, pairs: [string, string][]) => {
      for (const [k, u] of pairs) { plates.set(k, pass); by.set(k + "\u0000" + u, pass); }
    },
    count: async (pass: number) => [...plates.values()].filter((p) => p === pass).length,
    countBy: async (pass: number, u: string) => [...by.entries()].filter(([key, p]) => p === pass && key.split("\u0000")[1] === u).length,
    cleanup: async (pass: number) => {
      for (const [k, p] of [...plates]) if (p < pass) plates.delete(k);
      for (const [k, p] of [...by]) if (p < pass) by.delete(k);
    },
  };
}

function fakeDrive(getFiles: () => StatFile[], o: { failSteps?: number; failList?: boolean } = {}) {
  let calls = 0, fails = o.failSteps ?? 0;
  const pageOf = (after: string, until: string, token?: string) => {
    const q = getFiles().filter((f) => (!after || f.createdTime! >= after) && (!until || f.createdTime! < until))
      .sort((a, b) => a.createdTime!.localeCompare(b.createdTime!) || a.id!.localeCompare(b.id!));
    const start = Number(token ?? 0);
    return { files: q.slice(start, start + 40), next: start + 40 < q.length ? String(start + 40) : null };
  };
  return {
    step: async (t: CountTask, cut: boolean) => {
      calls++;
      if (fails > 0) { fails--; throw new Error("drive_failed"); }
      const p = pageOf(t.after, t.until, t.token);
      return stepFromPage(p.files, p.next, t.after, cut, true);
    },
    listNew: async (since: string, token?: string) => {
      calls++;
      if (o.failList) throw new Error("drive_failed");
      return pageOf(since, "", token);
    },
    calls: () => calls,
  };
}

const L = "ابحدرسصطعقكلمنهوي";
function files(n: number, from: string, to: string, prefix = "f"): StatFile[] {
  const a = Date.parse(from), b = Date.parse(to);
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    name: i % 9 === 0 ? `ملف ${i}.pdf` : `${L[i % 17]} ${L[(i * 3) % 17]} ${L[(i * 5) % 17]} ${1000 + (i % 400)}.pdf`,
    createdTime: new Date(a + Math.floor(((b - a) * i) / n)).toISOString(),
    owners: [{ displayName: i % 2 ? "ماني" : "شركة قمة", emailAddress: i % 2 ? "b@mani.sa" : "a@qemma.sa" }],
  }));
}
const distinctPlates = (fs: StatFile[]) => new Set(fs.map((f) => plateOf(f.name)).filter(Boolean)).size;

function deps(store: ReturnType<typeof fakeStore>, plates: ReturnType<typeof fakePlates>, d: ReturnType<typeof fakeDrive>, now: () => Date): JobDeps {
  return {
    lock: store.lock, save: store.save, release: store.release,
    plates, step: d.step, listNew: d.listNew, now,
    budgetMs: 60_000, maxSteps: 6, concurrency: 4,
  };
}

describe("🔴 الدورة على السيرفر", () => {
  it("🔴 أول مرة: العدّ الكامل بيبدأ لوحده ويكمّل على كذا دورة لحد ما يخلص ⇒ النتيجة محفوظة", async () => {
    const all = files(900, "2025-01-01T00:00:00Z", "2026-10-04T08:00:00Z");
    const store = fakeStore(), plates = fakePlates(), d = fakeDrive(() => all);
    const now = () => new Date("2026-10-04T09:00:00Z");

    const first = await certStatsTick(deps(store, plates, d, now));
    expect(first.action).toBe("pass");
    expect(store.get().pass?.n).toBeGreaterThan(0);
    expect(store.get().snapshot).toBeFalsy();

    let ticks = 1;
    while (!store.get().snapshot && ticks < 500) { await certStatsTick(deps(store, plates, d, now)); ticks++; }
    const s = store.get();
    expect(ticks).toBeGreaterThan(3);
    expect(s.pass).toBeFalsy();
    expect(s.snapshot!.n).toBe(900);
    expect(s.snapshot!.plates).toBe(distinctPlates(all));
    expect(s.snapshot!.platesBy["a@qemma.sa"] + s.snapshot!.platesBy["b@mani.sa"]).toBeGreaterThanOrEqual(distinctPlates(all));
    expect(s.snapshot!.pass).toBe(1);
  });

  it("🔴 بين العدّات: الجديد بيتضاف لوحده — ومفيش كتابة للحالة لو مفيش جديد", async () => {
    let all = files(300, "2026-01-01T00:00:00Z", "2026-10-04T08:00:00Z");
    const store = fakeStore(), plates = fakePlates(), d = fakeDrive(() => all);
    let t = Date.parse("2026-10-04T09:00:00Z");
    const now = () => new Date(t);
    while (!store.get().snapshot) await certStatsTick(deps(store, plates, d, now));
    const snap0 = store.get().snapshot!;

    t += 60_000;
    const quiet = await certStatsTick(deps(store, plates, d, now));
    expect(quiet).toEqual({ action: "new", added: 0 });
    const savesBefore = store.writes.save;
    await certStatsTick(deps(store, plates, d, now));
    expect(store.writes.save).toBe(savesBefore);   // مفيش جديد ⇒ بس فك القفل

    const fresh = files(25, "2026-10-04T08:30:00Z", "2026-10-04T08:59:00Z", "new");
    all = [...all, ...fresh];
    t += 60_000;
    const r = await certStatsTick(deps(store, plates, d, now));
    expect(r).toEqual({ action: "new", added: 25 });
    const snap1 = store.get().snapshot!;
    expect(snap1.n).toBe(snap0.n + 25);
    expect(snap1.plates).toBe(distinctPlates(all));
    expect(snap1.fullAt).toBe(snap0.fullAt);
    expect(Date.parse(snap1.at)).toBeGreaterThan(Date.parse(snap0.at));
  });

  it("🔴 كل يوم عدّ كامل جديد في الخلفية — والنتيجة القديمة تفضل ظاهرة لحد ما يخلص (والممسوح يتشال)", async () => {
    let all = files(200, "2026-01-01T00:00:00Z", "2026-10-04T08:00:00Z");
    const store = fakeStore(), plates = fakePlates(), d = fakeDrive(() => all);
    let t = Date.parse("2026-10-04T09:00:00Z");
    const now = () => new Date(t);
    while (!store.get().snapshot) await certStatsTick(deps(store, plates, d, now));
    const old = store.get().snapshot!;

    all = all.slice(0, 150);   // ملفات اتمسحت من درايف
    t += FULL_EVERY_MS + 1;
    const r = await certStatsTick(deps(store, plates, d, now));
    expect(r.action).toBe("pass");
    expect(store.get().pass?.pass).toBe(2);
    expect(store.get().snapshot!.n).toBe(old.n);   // القديمة لسه ظاهرة

    while (store.get().pass) await certStatsTick(deps(store, plates, d, now));
    const s = store.get().snapshot!;
    expect(s.pass).toBe(2);
    expect(s.n).toBe(150);
    expect(s.plates).toBe(distinctPlates(all));
  });

  it("دورة تانية شغّالة ⇒ مابيعملش حاجة", async () => {
    const store = fakeStore(), plates = fakePlates(), d = fakeDrive(() => files(10, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"));
    store.setLocked(true);
    expect(await certStatsTick(deps(store, plates, d, () => new Date("2026-10-04T09:00:00Z")))).toEqual({ action: "busy" });
    expect(d.calls()).toBe(0);
  });

  it("🔴 درايف وقع ⇒ السبب بيتسجّل والحالة بتتحفظ، والدورات الجاية بتكمّل — والنتيجة بالظبط", async () => {
    const all = files(400, "2026-01-01T00:00:00Z", "2026-10-04T08:00:00Z");
    const store = fakeStore(), plates = fakePlates(), d = fakeDrive(() => all, { failSteps: 4 });   // أول ٤ (اللي بيتبعتوا مع بعض) يفشلوا
    const now = () => new Date("2026-10-04T09:00:00Z");
    await certStatsTick(deps(store, plates, d, now));
    expect(store.get().pass?.fails).toBeGreaterThan(0);
    expect(store.get().pass?.lastFail).toBe("drive_failed");
    await certStatsTick(deps(store, plates, d, now));
    expect(store.get().pass?.lastFail).toBeUndefined();   // درايف رجع ⇒ التحذير بيروح
    let ticks = 0;
    while (!store.get().snapshot && ticks++ < 500) await certStatsTick(deps(store, plates, d, now));
    expect(store.get().snapshot!.n).toBe(400);
  });

  it("درايف وقع وقت تحديث الجديد ⇒ السبب بيتسجّل والنتيجة القديمة زي ما هي", async () => {
    const all = files(100, "2026-01-01T00:00:00Z", "2026-10-04T08:00:00Z");
    const store = fakeStore(), plates = fakePlates();
    const ok = fakeDrive(() => all);
    const now = () => new Date("2026-10-04T09:00:00Z");
    while (!store.get().snapshot) await certStatsTick(deps(store, plates, ok, now));
    const n = store.get().snapshot!.n;
    const r = await certStatsTick(deps(store, plates, fakeDrive(() => all, { failList: true }), now));
    expect(r).toEqual({ action: "error", error: "drive_failed" });
    expect(store.get().lastError).toBe("drive_failed");
    expect(store.get().snapshot!.n).toBe(n);
  });
});
