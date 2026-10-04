import { describe, it, expect } from "vitest";
import {
  riyadhDay, uploaderOf, stepFromPage, countRanges, splitRange, countAll, statsFromCounts,
  UNKNOWN_UPLOADER, type CountTask, type StepResult, type StatFile,
} from "@/lib/certStats";

/**
 * 📊 **إحصائيات الشهايد** — المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات
 * وعايز كل شركه رافعه كم شهادة وعايز كم شهادة اترفعت يوميا». وبعد أول نسخة:
 *  · «مش عايز التأخير دة» — العدّ كان طلب واحد طويل؛ دلوقتي فترات بتتعدّ **مع بعض**،
 *    والفترة الكبيرة بتتقسم لوحدها.
 *  · «عايز كل الشهادات ميسيبش ولا شهادة» — **كل PDF بيتعدّ** (كان اللي اسمه مش لوحة بيتساب).
 *  · «يجيب اسم الشركه بالظبط اللي منزله الشهادة» — كان بيجيب اسم **الفولدر** («الشهادات»)؛
 *    دلوقتي **الحساب اللي رفع الملف** — اسمه وإيميله.
 *  · «مش عايز العدد يكون ناقص» — مافيش حد أقصى ولا نتيجة ناقصة: يا العدّ كامل يا مفيش.
 */

const user = (displayName: string, emailAddress?: string) => ({ displayName, emailAddress });

describe("اليوم بتوقيت السعودية", () => {
  it("بعد ٩ بالليل بتوقيت جرينتش = اليوم اللي بعده في السعودية", () => {
    expect(riyadhDay("2026-10-03T20:59:59Z")).toBe("2026-10-03");
    expect(riyadhDay("2026-10-03T21:00:00Z")).toBe("2026-10-04");
  });
});

describe("🔴 الشركة = الحساب اللي رفع الملف — مش اسم الفولدر", () => {
  it("صاحب الملف: اسمه وإيميله", () => {
    expect(uploaderOf({ owners: [user("شركة قمة", "certs@qemma.sa")] })).toEqual({ key: "certs@qemma.sa", name: "شركة قمة" });
  });
  it("ملف في درايف مشترك (مالوش صاحب) ⇒ اللي رفعه (آخر حد عدّله)", () => {
    expect(uploaderOf({ lastModifyingUser: user("التحصيل", "x@tahseel.sa") })).toEqual({ key: "x@tahseel.sa", name: "التحصيل" });
  });
  it("إيميل مخفي ⇒ بالاسم بس · مفيش خالص ⇒ فاضي", () => {
    expect(uploaderOf({ owners: [user("ماني")] })).toEqual({ key: "ماني", name: "ماني" });
    expect(uploaderOf({})).toEqual({ key: "", name: "" });
  });
});

describe("🔴 خطوة = صفحة من درايف (مترتّبة بتاريخ الرفع)", () => {
  const f = (t: string, who = "a@x.sa"): StatFile => ({ createdTime: t, owners: [user(who.split("@")[0], who)] });

  it("آخر صفحة ⇒ كل الملفات بتتعدّ", () => {
    const r = stepFromPage([f("2026-10-01T00:00:00.000Z"), f("2026-10-02T00:00:00.000Z", "b@y.sa")], null, "");
    expect(r.n).toBe(2);
    expect(r.next).toBeNull();
    expect(r.resume).toBeNull();
    expect(r.counts).toEqual({ "a@x.sa": { "2026-10-01": 1 }, "b@y.sa": { "2026-10-02": 1 } });
    expect(r.people).toEqual({ "a@x.sa": "a", "b@y.sa": "b" });
  });

  it("🔴 فيه بعدها ⇒ بنعدّ اللي قبل آخر لحظة، والباقي (من آخر لحظة، شاملة) بيتقسم ويتعدّ مع بعض", () => {
    const page = Array.from({ length: 11 }, (_, i) => f(`2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`));
    page.push(f("2026-10-11T00:00:00.000Z"));   // نفس آخر لحظة ⇒ تتعدّ مع الباقي (مش مرتين ولا تتساب)
    const r = stepFromPage(page, "TOKEN", "");
    expect(r.n).toBe(10);
    expect(r.resume).toBe("2026-10-11T00:00:00.000Z");
    expect(r.next).toBeNull();
    // ممنوع التقسيم (درايف ماحترمش الترتيب قبل كده) ⇒ الكل والعلامة
    const noCut = stepFromPage(page, "TOKEN", "", false);
    expect([noCut.n, noCut.next, noCut.resume]).toEqual([12, "TOKEN", null]);
  });

  it("مش مترتّبة / كلها نفس اللحظة / لحظات قليلة ⇒ بنعدّها كلها ونكمّل بالعلامة (مافيش تقسيم)", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`);
    const unsorted = stepFromPage([...days].reverse().map((t) => f(t)), "T", "");
    expect([unsorted.n, unsorted.next, unsorted.resume]).toEqual([12, "T", null]);
    const same = stepFromPage(days.map(() => f(days[0])), "T", "");
    expect([same.n, same.next, same.resume]).toEqual([12, "T", null]);
    const few = stepFromPage(days.map((_, i) => f(days[i % 3])).sort((a, b) => a.createdTime!.localeCompare(b.createdTime!)), "T", "");
    expect([few.n, few.next, few.resume]).toEqual([12, "T", null]);
  });
});

describe("الفترات", () => {
  it("بتغطّي من الأول للآخر: الأولى من غير بداية، والأخيرة من غير نهاية، وكل حد بداية اللي بعده", () => {
    const r = countRanges(new Date("2026-10-04T09:00:00Z"));
    expect(r.length).toBeGreaterThan(4);
    expect(r[0].after).toBe("");
    expect(r[r.length - 1].until).toBe("");
    for (let i = 1; i < r.length; i++) {
      expect(r[i].after).toBe(r[i - 1].until);
      if (i > 1) expect(r[i].after > r[i - 1].after).toBe(true);
    }
  });
  it("تقسيم الباقي: متلاصق من غير ثغرة — والفترة الصغيرة جداً مابتتقسمش", () => {
    const now = Date.parse("2026-10-04T09:00:00Z");
    const parts = splitRange("2026-10-01T00:00:00.000Z", "", now);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].after).toBe("2026-10-01T00:00:00.000Z");
    expect(parts[parts.length - 1].until).toBe("");
    for (let i = 1; i < parts.length; i++) expect(parts[i].after).toBe(parts[i - 1].until);
    expect(splitRange("2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.001Z", now))
      .toEqual([{ after: "2026-10-01T00:00:00.000Z", until: "2026-10-01T00:00:00.001Z" }]);
  });
});

/** درايف مزيّف: بيفلتر بالفترة، بيرتّب (أو لأ)، وصفحات (ممكن ناقصة/فاضية) بعلامة — زي الحقيقي. */
/** `order`: مرتّب فعلاً · عشوائي (درايف ماحترمش الترتيب) · كل صفحة مرتّبة لوحدها بس (ترتيب كداب). */
function fakeDrive(files: StatFile[], o: { pageSize: number; order: "sorted" | "random" | "pageSorted"; partial?: boolean; failAtCall?: number }) {
  let calls = 0, active = 0, maxActive = 0;
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const indexed = files.map((f, i) => ({ f, i }));
  const step = async (t: CountTask, cut: boolean): Promise<StepResult> => {
    const me = ++calls; active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 0));
    active--;
    if (o.failAtCall === me) throw new Error("drive_failed");
    const q = indexed.filter(({ f }) => (!t.after || f.createdTime! >= t.after) && (!t.until || f.createdTime! < t.until));
    const byTime = (a: { f: StatFile; i: number }, b: { f: StatFile; i: number }) => a.f.createdTime!.localeCompare(b.f.createdTime!) || a.i - b.i;
    if (o.order === "sorted") q.sort(byTime);
    else q.sort((a, b) => hash(t.after + t.until + a.i) - hash(t.after + t.until + b.i));
    const page = Number(t.token ?? 0);
    const size = (k: number) => (o.partial ? (k * 7 + 3) % (o.pageSize + 1) : o.pageSize);
    let start = 0;
    for (let k = 0; k < page; k++) start += size(k);
    const end = Math.min(q.length, start + size(page));
    const slice = q.slice(Math.min(start, q.length), end);
    if (o.order === "pageSorted") slice.sort(byTime);
    return stepFromPage(slice.map((x) => x.f), end < q.length ? String(page + 1) : null, t.after, cut);
  };
  return { step, info: () => ({ calls, maxActive }) };
}

/** أرشيف: منتشر على ٣ سنين + رفعة واحدة ٦٠٠ ملف في ٥ دقايق + ١٥٠ ملف في نفس اللحظة + النهارده. */
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
  const out: StatFile[] = [];
  const at = (ms: number, k: number) => out.push({ createdTime: new Date(ms).toISOString(), ...who[k % who.length] });
  const from = Date.parse("2023-06-01T00:00:00Z"), to = Date.parse("2026-10-04T08:00:00Z");
  for (let i = 0; i < 1000; i++) at(from + Math.floor(rnd() * (to - from)), i);
  const burst = Date.parse("2026-09-15T10:00:00Z");
  for (let i = 0; i < 600; i++) at(burst + Math.floor(rnd() * 5 * 60_000), i + 1);
  for (let i = 0; i < 150; i++) at(Date.parse("2026-09-20T08:00:00Z"), 2);
  for (let i = 0; i < 50; i++) at(to - Math.floor(rnd() * 20 * 3_600_000), i + 3);
  return out;
}

describe("🔴 العدّ كله مع بعض — مايسيبش ولا ملف ومايعدّش ملف مرتين", () => {
  const files = archive();
  const now = new Date("2026-10-04T09:00:00Z");
  const expected: Record<string, number> = {};
  for (const f of files) { const k = uploaderOf(f).key; expected[k] = (expected[k] ?? 0) + 1; }

  const check = async (o: Parameters<typeof fakeDrive>[1]) => {
    const d = fakeDrive(files, o);
    const seen: number[] = [];
    const r = await countAll(d.step, { now, concurrency: 8, onProgress: (n) => seen.push(n) });
    expect(r.n).toBe(files.length);
    const s = statsFromCounts(r.counts, r.people, now, 30);
    expect(s.total).toBe(files.length);
    const got: Record<string, number> = {};
    for (const c of s.companies) got[c.email || (c.name === UNKNOWN_UPLOADER ? "" : c.name)] = c.total;
    expect(got).toEqual(expected);
    expect(seen[seen.length - 1]).toBe(files.length);
    return d.info();
  };

  it("🔴 درايف مرتّب: الفترة الكبيرة بتتقسم وبتتعدّ مع بعض (مش ورا بعض)", async () => {
    const info = await check({ pageSize: 50, order: "sorted" });
    expect(info.maxActive).toBeGreaterThan(4);
    // ١٨٠٠ ملف ÷ ٥٠ = ٣٦ صفحة لو ورا بعض — التقسيم مابيضاعفش الطلبات
    expect(info.calls).toBeLessThan(200);
  });
  it("🔴 صفحات ناقصة أو فاضية (درايف بيعمل كده) ⇒ برضه بالظبط", async () => {
    await check({ pageSize: 50, order: "sorted", partial: true });
  });
  it("🔴 درايف ماحترمش الترتيب ⇒ بيكمّل صفحة صفحة وبرضه بالظبط", async () => {
    await check({ pageSize: 50, order: "random" });
  });
  it("🔴 كل صفحة مترتّبة لوحدها بس (الترتيب كداب) ⇒ أول تقسيم بيتراجع، بيكتشف وبيعدّ صفحة صفحة — بالظبط", async () => {
    await check({ pageSize: 50, order: "pageSorted" });
  });
  it("🔴 خطوة فشلت ⇒ العدّ كله بيفشل (مافيش نتيجة ناقصة تظهر)", async () => {
    const d = fakeDrive(files, { pageSize: 50, order: "sorted", failAtCall: 5 });
    await expect(countAll(d.step, { now, concurrency: 8 })).rejects.toThrow("drive_failed");
  });
});

describe("🔴 الإجمالي · كل شركة · كل يوم", () => {
  const now = new Date("2026-10-04T09:00:00Z");   // ١٢ الضهر في السعودية
  const r = stepFromPage([
    { createdTime: "2026-09-01T10:00:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },   // أقدم من ٣٠ يوم
    { createdTime: "2026-10-03T10:00:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },   // امبارح
    { createdTime: "2026-10-04T05:00:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },   // النهارده
    { createdTime: "2026-10-04T05:30:00.000Z", owners: [user("شركة قمة", "a@qemma.sa")] },
    { createdTime: "2026-10-04T06:00:00.000Z", owners: [user("ماني", "b@mani.sa")] },
    { createdTime: "2026-10-04T07:00:00.000Z" },                                              // رافع مش معروف
  ], null, "");
  const s = statsFromCounts(r.counts, r.people, now, 30);

  it("🔴 الإجمالي = كل الملفات", () => expect(s.total).toBe(6));

  it("🔴 كل شركة باسمها وإيميلها: إجماليها وآخر ٣٠ يوم — الأكتر فوق", () => {
    expect(s.companies).toEqual([
      { name: "شركة قمة", email: "a@qemma.sa", total: 4, last30: 3 },
      { name: "ماني", email: "b@mani.sa", total: 1, last30: 1 },
      { name: UNKNOWN_UPLOADER, email: "", total: 1, last30: 1 },
    ]);
  });

  it("🔴 كل يوم (آخر ٣٠ يوم) — الأحدث فوق، الفاضي صفر، وكل شركة رفعت كام", () => {
    expect(s.daily).toHaveLength(30);
    expect(s.daily[0]).toEqual({
      day: "2026-10-04", total: 4,
      byCompany: [{ name: "شركة قمة", count: 2 }, { name: "ماني", count: 1 }, { name: UNKNOWN_UPLOADER, count: 1 }],
    });
    expect(s.daily[1]).toEqual({ day: "2026-10-03", total: 1, byCompany: [{ name: "شركة قمة", count: 1 }] });
    expect(s.daily[2]).toEqual({ day: "2026-10-02", total: 0, byCompany: [] });
    expect(s.daily[29].day).toBe("2026-09-05");
  });
});
