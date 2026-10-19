import { describe, it, expect } from "vitest";
import {
  needsAreaFill, applyAreaFill, areaTargetKey, NearbyAddressCache, runAreaFill, etaText, areaFillStatusText,
  type AreaFillProgress,
} from "@/lib/areaBackfill";

/**
 * 📍 «املأ الحي والشارع» للسجلات القديمة — المالك (١٩ أكتوبر ٢٠٢٦): مشترك صدّر لوحات كتير من Voice PRO
 * وكان ناسي «الحي تلقائي من الـGPS» مقفول ⇒ اللوحات اتسجّلت من غير شارع ولا حي، بس **كل لوحة معاها موقعها**.
 * «اعملها من عندي وكمان يكون فيه زرار عند المندوب» · «عايز دة يحصل ل كل الداتا بتاعته حتي اللي مصدرها من زمان».
 *
 * القواعد:
 *  · الحي بيتكتب في **نفس العمود** اللي كان هيتكتب فيه لو التلقائي كان مفتوح (كل مصدر بعموده).
 *  · سجل ليه حي ⇒ **مايتلمسش** (اللي المندوب كتبه بإيده دايماً الأول).
 *  · من غير موقع ⇒ مابنخترعش.
 *  · خدمة العناوين طلب في الثانية ⇒ نفس المكان (<١٥م) مايتسألش تاني.
 */
const VOICE = "fc-trial-a1-1760000000000-r1";
const CAM = "fc-cam-h1";
const MJ = "fc-mj-p1";

describe("🔴 مين محتاج حي", () => {
  it("لوحة Voice PRO بموقع ومن غير حي ⇒ محتاجة", () => {
    expect(needsAreaFill({ local_id: VOICE, lat: 24.7, lng: 46.6, extra: { "رقم اللوحة": "ابح1234" } })).toBe(true);
  });
  it("ليها حي (بأي اسم من الاتنين) ⇒ لأ", () => {
    expect(needsAreaFill({ local_id: VOICE, lat: 24.7, lng: 46.6, extra: { "اسم الحي - الشارع": "النسيم" } })).toBe(false);
    expect(needsAreaFill({ local_id: CAM, lat: 24.7, lng: 46.6, extra: { "الحي-الشارع": "شارع ٣٠ - النسيم" } })).toBe(false);
  });
  it("من غير موقع (أو صفر/مش رقم) ⇒ لأ — مابنخترعش", () => {
    expect(needsAreaFill({ local_id: VOICE, lat: null, lng: null, extra: {} })).toBe(false);
    expect(needsAreaFill({ local_id: VOICE, lat: 0, lng: 0, extra: {} })).toBe(false);
    expect(needsAreaFill({ local_id: VOICE, lat: Number.NaN, lng: 46.6, extra: {} })).toBe(false);
  });
  it("الموقع جاي نص من السيرفر (\"24.7\") ⇒ عادي — وفاضي ⇒ لأ", () => {
    expect(needsAreaFill({ local_id: VOICE, lat: "24.7", lng: "46.6", extra: {} })).toBe(true);
    expect(needsAreaFill({ local_id: VOICE, lat: "", lng: "", extra: {} })).toBe(false);
  });
  it("«غير متاح - غير متاح» (فشل قديم) ⇒ محتاجة", () => {
    expect(needsAreaFill({ local_id: CAM, lat: 24.7, lng: 46.6, extra: { "الحي-الشارع": "غير متاح - غير متاح" } })).toBe(true);
  });
  it("عمود «الحي» من ملف البنك (عنوان صاحب العربية) مش مكان المندوب ⇒ لسه محتاجة", () => {
    expect(needsAreaFill({ local_id: CAM, lat: 24.7, lng: 46.6, extra: { "الحي": "الملز" } })).toBe(true);
  });
  it("المجمّع: «اسم الحي» موجود ⇒ لأ، فاضي ⇒ محتاجة", () => {
    expect(needsAreaFill({ local_id: MJ, lat: 24.7, lng: 46.6, extra: { "اسم الحي": "العليا" } })).toBe(false);
    expect(needsAreaFill({ local_id: MJ, lat: 24.7, lng: 46.6, extra: {} })).toBe(true);
  });
  it("extra فاضي/null ⇒ عادي", () => {
    expect(needsAreaFill({ local_id: VOICE, lat: 24.7, lng: 46.6, extra: null })).toBe(true);
  });
});

describe("🔴 الحي بيتكتب في عمود مصدره", () => {
  const addr = { street: "شارع الأمير سلطان", district: "النسيم" };
  it("Voice PRO ⇒ «اسم الحي - الشارع» بصيغة «الشارع - الحي» — والباقي زي ما هو", () => {
    const row = { "رقم اللوحة": "ابح1234", "النوع": "ج" };
    expect(areaTargetKey(VOICE)).toBe("اسم الحي - الشارع");
    expect(applyAreaFill(VOICE, row, addr)).toEqual({ "رقم اللوحة": "ابح1234", "النوع": "ج", "اسم الحي - الشارع": "شارع الأمير سلطان - النسيم" });
    expect(row).toEqual({ "رقم اللوحة": "ابح1234", "النوع": "ج" });   // الأصل مااتلمسش
  });
  it("التشييك (كاميرا/يدوي/صوتي) ⇒ «الحي-الشارع»", () => {
    expect(areaTargetKey(CAM)).toBe("الحي-الشارع");
    expect(applyAreaFill(CAM, {}, addr)).toEqual({ "الحي-الشارع": "شارع الأمير سلطان - النسيم" });
  });
  it("المجمّع ⇒ «اسم الحي» = الحي بس", () => {
    expect(areaTargetKey(MJ)).toBe("اسم الحي");
    expect(applyAreaFill(MJ, {}, addr)).toEqual({ "اسم الحي": "النسيم" });
  });
  it("العنوان فشل («غير متاح») ⇒ ولا حاجة", () => {
    expect(applyAreaFill(VOICE, {}, { street: "غير متاح", district: "غير متاح" })).toBeNull();
  });
  it("السجل خد حي في النص (المندوب كتبه) ⇒ مانكتبش فوقه", () => {
    expect(applyAreaFill(VOICE, { "اسم الحي - الشارع": "كتبته بإيدي" }, addr)).toBeNull();
  });
  it("القديم «غير متاح» بيتبدّل", () => {
    expect(applyAreaFill(CAM, { "الحي-الشارع": "غير متاح" }, addr)).toEqual({ "الحي-الشارع": "شارع الأمير سلطان - النسيم" });
  });
});

describe("⚡ نفس المكان مايتسألش تاني", () => {
  it("أقل من ١٥م ⇒ نفس العنوان، ٣٠م ⇒ لأ", () => {
    const c = new NearbyAddressCache();
    c.set(24.7, 46.6, { street: "أ", district: "ب" });
    expect(c.get(24.7 + 0.00009, 46.6)).toEqual({ street: "أ", district: "ب" });   // ~١٠م
    expect(c.get(24.7 + 0.00027, 46.6)).toBeUndefined();                          // ~٣٠م
  });
  it("قريب بس في خانة جنبها ⇒ برضه بيلاقيه", () => {
    const c = new NearbyAddressCache();
    c.set(24.70004, 46.60004, { street: "أ", district: "ب" });
    expect(c.get(24.70006, 46.60006)).toBeDefined();
  });
});

type Rec = { id: string; lat: number; lng: number; at: string };
function fakeServer(pages: Rec[][]) {
  const applied: { id: string; street: string; district: string }[][] = [];
  const scans: (string | null)[] = [];
  const call = async (body: { action: string; after?: string | null; items?: { id: string; street: string; district: string }[] }) => {
    if (body.action === "scan") {
      scans.push(body.after ?? null);
      const i = body.after ? Number(body.after) : 0;
      return { items: pages[i] ?? [], scanned: (pages[i] ?? []).length + 5, next: i + 1 < pages.length ? String(i + 1) : null };
    }
    applied.push(body.items ?? []);
    return { updated: (body.items ?? []).length, skipped: 0 };
  };
  return { call, applied, scans };
}
const noSleep = async () => {};

describe("🔁 التشغيل كله", () => {
  it("بيقرا كل الصفحات، والعربيات اللي جنب بعض طلب واحد، والنتيجة بتتحفظ على دفعات", async () => {
    const srv = fakeServer([
      [{ id: "x1", lat: 24.7, lng: 46.6, at: "2026-01-01T10:00:00Z" }, { id: "x2", lat: 24.70003, lng: 46.6, at: "2026-01-01T10:00:05Z" }],
      [{ id: "x3", lat: 24.8, lng: 46.7, at: "2026-01-01T11:00:00Z" }],
    ]);
    const asked: [number, number][] = [];
    const reverse = async (lat: number, lng: number) => { asked.push([lat, lng]); return { street: "ش" + lat, district: "ح" }; };
    const seen: AreaFillProgress[] = [];
    const res = await runAreaFill({ call: srv.call, reverse, onProgress: (p) => seen.push(p), minGapMs: 0, batchSize: 2, sleep: noSleep });
    expect(srv.scans).toEqual([null, "1"]);
    expect(asked.length).toBe(2);                       // x2 أخد عنوان x1 (٣م)
    expect(srv.applied.flat().map((i) => i.id).sort()).toEqual(["x1", "x2", "x3"]);
    expect(srv.applied.every((b) => b.length <= 2)).toBe(true);
    expect(res).toMatchObject({ phase: "done", total: 3, done: 3, filled: 3, reused: 1, failed: 0, scanned: 13 });
    expect(seen.some((p) => p.phase === "scan")).toBe(true);
  });

  it("العنوان فشل حتى بعد المحاولة التانية ⇒ بيتعدّ «مالقيناش» ومابيتبعتش", async () => {
    const srv = fakeServer([[{ id: "x1", lat: 24.7, lng: 46.6, at: "a" }, { id: "x2", lat: 25, lng: 47, at: "b" }]]);
    let n = 0;
    const reverse = async (lat: number) => { n++; return lat === 24.7 ? { street: "غير متاح", district: "غير متاح" } : { street: "ش", district: "ح" }; };
    const res = await runAreaFill({ call: srv.call, reverse, minGapMs: 0, sleep: noSleep });
    expect(n).toBe(3);                                  // x1 مرتين + x2
    expect(srv.applied.flat().map((i) => i.id)).toEqual(["x2"]);
    expect(res).toMatchObject({ phase: "done", filled: 1, failed: 1 });
  });

  it("«وقّف» ⇒ بيقف ويحفظ اللي خلص (المرة الجاية بتكمّل من الناقص)", async () => {
    const recs = Array.from({ length: 6 }, (_, i) => ({ id: "x" + i, lat: 24 + i, lng: 46, at: String(i) }));
    const srv = fakeServer([recs]);
    const ac = new AbortController();
    let n = 0;
    const reverse = async () => { if (++n === 3) ac.abort(); return { street: "ش", district: "ح" }; };
    const res = await runAreaFill({ call: srv.call, reverse, minGapMs: 0, batchSize: 25, sleep: noSleep, signal: ac.signal });
    expect(res.phase).toBe("stopped");
    expect(srv.applied.flat().length).toBe(3);          // اللي خلص اتحفظ
  });

  it("مفيش حاجة ناقصة ⇒ خلاص على طول من غير ولا طلب", async () => {
    const srv = fakeServer([[]]);
    let n = 0;
    const res = await runAreaFill({ call: srv.call, reverse: async () => { n++; return { street: "", district: "" }; }, minGapMs: 0, sleep: noSleep });
    expect(n).toBe(0);
    expect(res).toMatchObject({ phase: "done", total: 0 });
  });

  it("السيرفر وقع وهو بيحفظ ⇒ بيحاول تاني، ولو فضل واقع ⇒ «غلط» برسالته", async () => {
    const srv = fakeServer([[{ id: "x1", lat: 24.7, lng: 46.6, at: "a" }]]);
    let tries = 0;
    const call = async (b: { action: string }) => {
      if (b.action === "apply") { tries++; throw new Error("مفيش نت"); }
      return srv.call(b as never);
    };
    const res = await runAreaFill({ call, reverse: async () => ({ street: "ش", district: "ح" }), minGapMs: 0, sleep: noSleep });
    expect(tries).toBe(3);
    expect(res.phase).toBe("error");
    expect(res.error).toContain("مفيش نت");
  });
});

describe("🗨️ الكلام اللي بيظهر", () => {
  const base = { scanned: 0, total: 0, done: 0, filled: 0, reused: 0, failed: 0, etaSec: null } as const;
  it("الوقت الباقي بالدقايق والساعات", () => {
    expect(etaText(30)).toBe("أقل من دقيقة");
    expect(etaText(5 * 60)).toBe("حوالي ٥ دقيقة");
    expect(etaText(95 * 60)).toBe("حوالي ١ ساعة و٣٥ دقيقة");
    expect(etaText(null)).toBe("");
  });
  it("كل مرحلة بكلامها", () => {
    expect(areaFillStatusText({ ...base, phase: "scan", scanned: 3000 })).toContain("٣٬٠٠٠");
    expect(areaFillStatusText({ ...base, phase: "fill", total: 200, done: 50, etaSec: 300 })).toContain("٥٠ من ٢٠٠");
    expect(areaFillStatusText({ ...base, phase: "done", total: 0 })).toContain("مفيش");
    expect(areaFillStatusText({ ...base, phase: "done", total: 10, done: 10, filled: 9, failed: 1 })).toContain("٩");
    expect(areaFillStatusText({ ...base, phase: "error", error: "مفيش نت" })).toContain("مفيش نت");
  });
});
