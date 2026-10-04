import { describe, it, expect } from "vitest";
import {
  riyadhDay, floorSec, uploaderOf, plateOf, stepFromPage, countRanges, splitRange,
  newPass, advancePass, snapshotFromPass, addNewFiles, viewFromSnapshot, LOOKBACK_MS,
  UNKNOWN_UPLOADER, type CountTask, type StepResult, type StatFile, type PassState,
} from "@/lib/certStats";

/**
 * 📊 **إحصائيات الشهايد** — المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز
 * كل شركه رافعه كم شهادة وعايز كم شهادة اترفعت يوميا» · «مش عايز التأخير دة» · «عايز كل الشهادات
 * ميسيبش ولا شهادة» · «يجيب اسم الشركه بالظبط اللي منزله الشهادة» · «مش عايز العدد يكون ناقص».
 * وبعدين: العدّ من الموبايل قعد ربع ساعة وعدّى ٦٠٠ ألف ملف، و«اللوحات اللي موجوده في كل الشركات
 * ميكملوش نص الرقم دة» ⇒ العدّ بقى **على السيرفر في الخلفية** (دورة كل دقيقة بتكمّل من مكانها)،
 * والصفحة بتعرض **عدد الملفات** و**عدد اللوحات المختلفة** (كل لوحة مرة واحدة).
 */

const user = (displayName: string, emailAddress?: string) => ({ displayName, emailAddress });

describe("أساسيات", () => {
  it("اليوم بتوقيت السعودية", () => {
    expect(riyadhDay("2026-10-03T20:59:59Z")).toBe("2026-10-03");
    expect(riyadhDay("2026-10-03T21:00:00Z")).toBe("2026-10-04");
  });
  it("أول الثانية", () => {
    expect(floorSec("2026-10-04T05:00:01.987Z")).toBe("2026-10-04T05:00:01.000Z");
  });
  it("🔴 الشركة = الحساب اللي رفع: صاحبه، ولو درايف مشترك آخر حد عدّله", () => {
    expect(uploaderOf({ owners: [user("شركة قمة", "certs@qemma.sa")] })).toEqual({ key: "certs@qemma.sa", name: "شركة قمة" });
    expect(uploaderOf({ lastModifyingUser: user("التحصيل", "x@tahseel.sa") })).toEqual({ key: "x@tahseel.sa", name: "التحصيل" });
    expect(uploaderOf({ owners: [user("ماني")] })).toEqual({ key: "ماني", name: "ماني" });
    expect(uploaderOf({})).toEqual({ key: "", name: "" });
  });
  it("🔴 اللوحة من اسم الملف — نفس اللوحة بأي شكل = مفتاح واحد", () => {
    expect(plateOf("س د ط 2539.pdf")).toBe(plateOf("سدط2539.PDF"));
    expect(plateOf("س د ط 2539.pdf")).not.toBe("");
    for (const n of ["فاتورة.pdf", "12345678.pdf", "JTMHV05J804123456.pdf"]) expect(plateOf(n), n).toBe("");
  });
});

describe("🔴 خطوة = صفحة من درايف", () => {
  const f = (t: string, name = "س د ط 2539.pdf", who = "a@x.sa", id = t): StatFile =>
    ({ id, name, createdTime: t, owners: [user(who.split("@")[0], who)] });

  it("الملفات + اللوحات من غير تكرار + اللي اسمه مش لوحة + أحدث ملف", () => {
    const r = stepFromPage([
      f("2026-10-01T00:00:00.000Z", "س د ط 2539.pdf", "a@x.sa", "1"),
      f("2026-10-01T01:00:00.000Z", "سدط2539.pdf", "a@x.sa", "2"),      // نفس اللوحة ونفس الشركة
      f("2026-10-02T00:00:00.000Z", "س د ط 2539.pdf", "b@y.sa", "3"),   // نفس اللوحة، شركة تانية
      f("2026-10-02T05:00:00.000Z", "فاتورة.pdf", "b@y.sa", "4"),
    ], null, "");
    expect(r.n).toBe(4);
    expect(r.notPlate).toBe(1);
    expect(r.pairs).toEqual([[plateOf("س د ط 2539.pdf"), "a@x.sa"], [plateOf("س د ط 2539.pdf"), "b@y.sa"]]);
    expect(r.newest).toBe("2026-10-02T05:00:00.000Z");
    expect(r.counts).toEqual({ "a@x.sa": { "2026-10-01": 2 }, "b@y.sa": { "2026-10-02": 2 } });
  });

  it("🔴 فيه بعدها ⇒ بنعدّ اللي قبل **ثانية** آخر ملف، والباقي من أول الثانية دي (مش مرتين ولا بيتساب)", () => {
    const page = Array.from({ length: 11 }, (_, i) => f(`2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`));
    page.push(f("2026-10-11T00:00:00.400Z"), f("2026-10-11T00:00:00.900Z"));   // نفس ثانية آخر ملف
    const r = stepFromPage(page, "TOKEN", "");
    expect(r.n).toBe(10);
    expect(r.resume).toBe("2026-10-11T00:00:00.000Z");
    expect(r.next).toBeNull();
    const noCut = stepFromPage(page, "TOKEN", "", false);
    expect([noCut.n, noCut.next, noCut.resume]).toEqual([13, "TOKEN", null]);
  });

  it("مش مترتّبة / كلها في نفس الثانية / لحظات قليلة ⇒ الكل ونكمّل بالعلامة", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`);
    const unsorted = stepFromPage([...days].reverse().map((t) => f(t)), "T", "");
    expect([unsorted.n, unsorted.next, unsorted.resume]).toEqual([12, "T", null]);
    const oneSecond = stepFromPage(Array.from({ length: 12 }, (_, i) => f(`2026-10-01T00:00:00.${String(i * 50).padStart(3, "0")}Z`)), "T", "");
    expect([oneSecond.n, oneSecond.next, oneSecond.resume]).toEqual([12, "T", null]);
  });

  it("آخر ربع ساعة قبل أحدث ملف بترجع بالـid (عشان التحديث بالجديد مايعدّهاش تاني)", () => {
    const r = stepFromPage([
      f("2026-10-04T08:00:00.000Z", undefined, undefined, "old"),
      f("2026-10-04T08:40:00.000Z", undefined, undefined, "mid"),
      f("2026-10-04T08:50:00.000Z", undefined, undefined, "new"),
    ], null, "", true, true);
    expect(r.recent).toEqual([["mid", "2026-10-04T08:40:00.000Z"], ["new", "2026-10-04T08:50:00.000Z"]]);
    expect(stepFromPage([f("2026-10-04T08:50:00.000Z")], null, "").recent).toEqual([]);
  });
});

describe("الفترات — كلها بالثانية الكاملة", () => {
  it("بتغطّي من الأول للآخر من غير ثغرة", () => {
    const r = countRanges(new Date("2026-10-04T09:00:00.123Z"));
    expect(r[0].after).toBe("");
    expect(r[r.length - 1].until).toBe("");
    for (let i = 1; i < r.length; i++) {
      expect(r[i].after).toBe(r[i - 1].until);
      expect(r[i].after.endsWith(".000Z")).toBe(true);
    }
  });
  it("تقسيم الباقي ٤ متلاصقين بالثانية — والقصير (أقل من ٤ ثواني) مابيتقسمش", () => {
    const now = Date.parse("2026-10-04T09:00:00Z");
    const parts = splitRange("2026-10-01T00:00:00.000Z", "", now);
    expect(parts).toHaveLength(4);
    expect(parts[3].until).toBe("");
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].after).toBe(parts[i - 1].until);
      expect(parts[i].after.endsWith(".000Z")).toBe(true);
      expect(parts[i].after > parts[i - 1].after).toBe(true);
    }
    expect(splitRange("2026-10-01T00:00:00.000Z", "2026-10-01T00:00:03.000Z", now))
      .toEqual([{ after: "2026-10-01T00:00:00.000Z", until: "2026-10-01T00:00:03.000Z" }]);
  });
});

// ── درايف مزيّف ──
type Order = "sorted" | "random" | "pageSorted";
type Precision = "exact" | "querySec" | "storedSec";
/** `jitter` = كل خطوة بتاخد وقت مختلف (بترجع بترتيب غير اللي اتبعتت بيه). */
function fakeDrive(all: () => StatFile[], o: { pageSize: number; order: Order; partial?: boolean; failAt?: Set<number>; precision?: Precision; jitter?: boolean }) {
  let calls = 0, active = 0, maxActive = 0;
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const sec = (iso: string) => iso.slice(0, 19) + ".000Z";
  const query = (after: string, until: string) => {
    const A = after && o.precision === "querySec" ? sec(after) : after;
    const U = until && o.precision === "querySec" ? sec(until) : until;
    const v = (f: StatFile) => (o.precision === "storedSec" ? sec(f.createdTime!) : f.createdTime!);
    return all().map((f, i) => ({ f, i })).filter(({ f }) => (!A || v(f) >= A) && (!U || v(f) < U));
  };
  const page = (q: { f: StatFile; i: number }[], token: string | undefined, key: string) => {
    const byTime = (a: { f: StatFile; i: number }, b: { f: StatFile; i: number }) => a.f.createdTime!.localeCompare(b.f.createdTime!) || a.i - b.i;
    if (o.order === "sorted") q.sort(byTime);
    else q.sort((a, b) => hash(key + a.i) - hash(key + b.i));
    const n = Number(token ?? 0);
    const size = (k: number) => (o.partial ? (k * 7 + 3) % (o.pageSize + 1) : o.pageSize);
    let start = 0;
    for (let k = 0; k < n; k++) start += size(k);
    const end = Math.min(q.length, start + size(n));
    const slice = q.slice(Math.min(start, q.length), end);
    if (o.order === "pageSorted") slice.sort(byTime);
    return { files: slice.map((x) => x.f), next: end < q.length ? String(n + 1) : null };
  };
  const step = async (t: CountTask, cut: boolean): Promise<StepResult> => {
    const me = ++calls; active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, o.jitter ? hash("j" + me) % 6 : 0));
    active--;
    if (o.failAt?.has(me)) throw new Error("drive_failed");
    const p = page(query(t.after, t.until), t.token, t.after + "|" + t.until);
    return stepFromPage(p.files, p.next, t.after, cut, true);
  };
  const list = async (since: string, token?: string) => page(query(since, ""), token, "new|" + since);
  return { step, list, info: () => ({ calls, maxActive }) };
}

/** أرشيف: منتشر على ٣ سنين + رفعات كتيرة في نفس الثانية + ١٥٠ ملف في نفس اللحظة + لوحات متكررة. */
function archive(): StatFile[] {
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const who = [
    { owners: [user("شركة قمة", "a@qemma.sa")] },
    { owners: [user("ماني", "b@mani.sa")] },
    { owners: [user("شركة النخبة", "c@nokhba.sa")] },
    { lastModifyingUser: user("التحصيل", "d@tahseel.sa") },
    {},
  ];
  const L = "ابحدرسصطعقكلمنهوي";
  const plate = (k: number) => `${L[k % 17]} ${L[(k * 7) % 17]} ${L[(k * 13) % 17]} ${1000 + (k % 900)}.pdf`;
  const out: StatFile[] = [];
  const at = (ms: number, k: number) => out.push({
    id: "f" + out.length,
    name: k % 11 === 0 ? `مستند ${k}.pdf` : plate(Math.floor(rnd() * 700)),
    createdTime: new Date(ms).toISOString(), ...who[k % who.length],
  });
  const from = Date.parse("2023-06-01T00:00:00Z"), to = Date.parse("2026-10-04T08:00:00Z");
  for (let i = 0; i < 1000; i++) at(from + Math.floor(rnd() * (to - from)), i);
  for (let b = 0; b < 6; b++) {   // رفعات جماعية: ١٠٠ ملف في ثانيتين
    const t0 = from + Math.floor(rnd() * (to - from));
    for (let i = 0; i < 100; i++) at(t0 + Math.floor(rnd() * 2000), i + b);
  }
  for (let i = 0; i < 150; i++) at(Date.parse("2026-09-20T08:00:00Z"), i);
  for (let i = 0; i < 50; i++) at(to - Math.floor(rnd() * 20 * 3_600_000), i + 3);
  return out;
}

/** عدّة كاملة على كذا دورة — الحالة بتتحفظ (JSON) بين كل دورة واللي بعدها. */
async function runPass(step: ReturnType<typeof fakeDrive>["step"], now: Date, perTick = 7) {
  let st: PassState = newPass(1, now);
  const plates = new Set<string>(), platesBy = new Map<string, Set<string>>();
  for (let tick = 0; tick < 2000; tick++) {
    let launched = 0;
    const r = await advancePass(st, step, {
      concurrency: 8,
      stop: () => ++launched > perTick,
      onCounted: async (res) => {
        for (const [k, u] of res.pairs) { plates.add(k); (platesBy.get(u) ?? platesBy.set(u, new Set()).get(u)!).add(k); }
      },
    });
    st = JSON.parse(JSON.stringify(st));
    if (r === "done") return { st, plates, platesBy, ticks: tick + 1 };
  }
  throw new Error("العدّة ماخلصتش");
}

describe("🔴 العدّ الكامل على كذا دورة — مايسيبش ولا ملف ومايعدّش ملف مرتين", () => {
  const files = archive();
  const now = new Date("2026-10-04T09:00:00Z");
  const expectedPlates = new Set(files.map((f) => plateOf(f.name)).filter(Boolean)).size;
  const expectedNotPlate = files.filter((f) => !plateOf(f.name)).length;

  const check = async (o: Parameters<typeof fakeDrive>[1]) => {
    const d = fakeDrive(() => files, o);
    const r = await runPass(d.step, now);
    expect(r.st.n).toBe(files.length);
    expect(r.st.notPlate).toBe(expectedNotPlate);
    expect(r.plates.size).toBe(expectedPlates);
    expect(r.st.queue).toEqual([]);
    return { ...d.info(), ticks: r.ticks };
  };

  it("🔴 درايف مرتّب: مع بعض فعلاً، وعلى كذا دورة", async () => {
    const info = await check({ pageSize: 50, order: "sorted" });
    expect(info.maxActive).toBeGreaterThan(4);
    expect(info.ticks).toBeGreaterThan(3);
  });
  it("🔴 صفحات ناقصة أو فاضية", async () => { await check({ pageSize: 50, order: "sorted", partial: true }); });
  it("🔴 درايف ماحترمش الترتيب", async () => { await check({ pageSize: 50, order: "random" }); });
  it("🔴 كل صفحة مترتّبة لوحدها بس (الترتيب كداب) ⇒ بيكتشف وبيعدّ صفحة صفحة", async () => {
    await check({ pageSize: 50, order: "pageSorted" });
    // والخطوات اللي كانت لسه شغّالة وقت ما اكتشف بترجع بعد ما العدّ اتعاد ⇒ بتترمي
    await check({ pageSize: 50, order: "pageSorted", jitter: true });
  });
  it("🔴 الخطوات بترجع بترتيب مختلف عن اللي اتبعتت بيه", async () => {
    await check({ pageSize: 50, order: "sorted", jitter: true, partial: true });
  });
  it("🔴 درايف بيقارن بالثانية (مش بالمللي) — في السؤال أو في الملفات", async () => {
    await check({ pageSize: 50, order: "sorted", precision: "querySec" });
    await check({ pageSize: 50, order: "sorted", precision: "storedSec" });
  });
  it("🔴 خطوات فشلت ⇒ بتتعاد في الدورة الجاية، والنتيجة برضه بالظبط", async () => {
    const info = await check({ pageSize: 50, order: "sorted", failAt: new Set([3, 9, 10, 40]) });
    expect(info.calls).toBeGreaterThan(40);
  });
});

describe("🔴 خطوة رجعت بعد ما العدّ اتعاد", () => {
  it("بتترمي: مابتتجمعش ومابتزوّدش الطابور", async () => {
    const now = new Date("2026-10-04T09:00:00Z");
    const st = newPass(1, now);
    st.queue = [{ after: "", until: "2026-01-01T00:00:00.000Z", verify: true }, { after: "2026-01-01T00:00:00.000Z", until: "" }];
    st.verifyExpected = 5;
    let releaseX!: () => void;
    const xGate = new Promise<void>((r) => { releaseX = r; });
    const mk = (n: number, prefix: string): StatFile[] =>
      Array.from({ length: n }, (_, i) => ({ id: prefix + i, name: "x.pdf", createdTime: new Date(Date.UTC(2025, 0, 1) + i * 1000).toISOString() }));
    const step = async (t: CountTask): Promise<StepResult> => {
      if (t.verify) return stepFromPage(mk(7, "v"), null, "", false);   // ٧ ≠ ٥ ⇒ الترتيب كداب ⇒ العدّ يتعاد
      await xGate;
      return stepFromPage(mk(100, "x"), "TOKEN", t.after, false);
    };
    let launched = 0;
    const run = advancePass(st, step, { concurrency: 8, stop: () => ++launched > 2 });
    await new Promise((r) => setTimeout(r, 5));
    releaseX();
    expect(await run).toBe("paused");
    expect(st.cut).toBe(false);
    expect(st.n).toBe(0);
    expect(st.queue).toEqual(countRanges(now));
  });
});

describe("🔴 الجديد بين العدّات الكاملة", () => {
  const now = new Date("2026-10-04T09:00:00Z");
  const base = (): StatFile[] => archive().filter((f) => f.createdTime! < "2026-10-04T08:30:00.000Z");

  it("الجديد بيتضاف مرة واحدة · المتأخّر في الظهور (جوّه آخر ربع ساعة) بيتلقط · التكرار ماينفعش", async () => {
    let files = base();
    const d = fakeDrive(() => files, { pageSize: 50, order: "sorted" });
    const { st } = await runPass(d.step, now);
    const snap = snapshotFromPass(st, 10, {}, now);
    const before = snap.n;

    const newest = Date.parse(snap.newest);
    const late: StatFile = { id: "late", name: "ك ل م 4321.pdf", createdTime: new Date(newest - 5 * 60_000).toISOString(), owners: [user("ماني", "b@mani.sa")] };
    const fresh: StatFile[] = Array.from({ length: 30 }, (_, i) => ({
      id: "n" + i, name: `ن ه و ${2000 + i}.pdf`, createdTime: new Date(newest + (i + 1) * 1000).toISOString(), owners: [user("شركة قمة", "a@qemma.sa")],
    }));
    files = [...files, late, ...fresh];

    const pairs: [string, string][] = [];
    const r1 = await addNewFiles(snap, d.list, { stop: () => false, onCounted: async (p) => { pairs.push(...p); } });
    expect(r1.added).toBe(31);
    expect(snap.n).toBe(before + 31);
    expect(pairs).toHaveLength(31);
    expect(r1.uploaders.sort()).toEqual(["a@qemma.sa", "b@mani.sa"]);

    const r2 = await addNewFiles(snap, d.list, { stop: () => false });
    expect(r2.added).toBe(0);
    expect(snap.n).toBe(before + 31);
    expect(snap.recent.every(([, t]) => t >= new Date(Date.parse(snap.newest) - LOOKBACK_MS).toISOString())).toBe(true);
  });
});

describe("🔴 العرض: الإجمالي · اللوحات المختلفة · كل شركة · كل يوم", () => {
  const now = new Date("2026-10-04T09:00:00Z");   // ١٢ الضهر في السعودية
  const r = stepFromPage([
    { id: "1", name: "س د ط 2539.pdf", createdTime: "2026-09-01T10:00:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },
    { id: "2", name: "س د ط 2540.pdf", createdTime: "2026-10-03T10:00:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },
    { id: "3", name: "س د ط 2541.pdf", createdTime: "2026-10-04T05:00:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },
    { id: "4", name: "س د ط 2541.pdf", createdTime: "2026-10-04T05:30:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },
    { id: "5", name: "فاتورة.pdf", createdTime: "2026-10-04T06:00:00.000Z", owners: [user("ماني", "b@mani.sa")] },
    { id: "6", name: "ا ب ح 1111.pdf", createdTime: "2026-10-04T07:00:00.000Z" },
  ], null, "");
  const st = { ...newPass(3, now), counts: r.counts, people: r.people, n: r.n, notPlate: r.notPlate, newest: r.newest, queue: [] };
  const v = viewFromSnapshot(snapshotFromPass(st, 4, { "a@qemma.sa": 3, "b@mani.sa": 0, "": 1 }, now), now);

  it("🔴 الملفات كلها + اللوحات المختلفة + اللي اسمه مش لوحة", () => {
    expect(v.files).toBe(6);
    expect(v.plates).toBe(4);
    expect(v.notPlate).toBe(1);
  });
  it("🔴 كل شركة باسمها وإيميلها: ملفاتها ولوحاتها المختلفة وآخر ٣٠ يوم — الأكتر فوق", () => {
    expect(v.companies).toEqual([
      { name: "شركة قمة", email: "a@qemma.sa", total: 4, plates: 3, last30: 3 },
      { name: "ماني", email: "b@mani.sa", total: 1, plates: 0, last30: 1 },
      { name: UNKNOWN_UPLOADER, email: "", total: 1, plates: 1, last30: 1 },
    ]);
  });
  it("🔴 كل يوم (آخر ٣٠ يوم) — الأحدث فوق والفاضي صفر", () => {
    expect(v.daily).toHaveLength(30);
    expect(v.daily[0]).toEqual({
      day: "2026-10-04", total: 4,
      byCompany: [{ name: "شركة قمة", count: 2 }, { name: "ماني", count: 1 }, { name: UNKNOWN_UPLOADER, count: 1 }],
    });
    expect(v.daily[1]).toEqual({ day: "2026-10-03", total: 1, byCompany: [{ name: "شركة قمة", count: 1 }] });
    expect(v.daily[2]).toEqual({ day: "2026-10-02", total: 0, byCompany: [] });
  });
});
