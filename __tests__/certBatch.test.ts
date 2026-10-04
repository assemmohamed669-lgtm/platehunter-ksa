import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  batchFindCertificates, clearCertBatchCache, digitsQuery,
  CERT_BATCH_MAX_PLATES, CERT_DIGITS_PER_QUERY, CERT_CACHE_TTL_MS, CERT_PARALLEL_QUERIES,
} from "@/lib/certBatch";
import type { DriveFile } from "@/lib/gdrive";

/**
 * 📄 **شهايد عربيات الفرز — دفعة واحدة.** المالك (٤ أكتوبر ٢٠٢٦): «قدام كل السيارات
 * المطلوبه لو السيارة ليها شهاده… يظهر قدامها كلمه شهاده بالازرق». وسأل: «لو عندي ٦٠
 * مندوب بيعملو فرز في نفس الوقت وكل واحد طالعلو ٥٠ لوحه… هيطلع لكل المناديب؟»
 *
 * البحث القديم سؤال لدرايف **لكل عربية** (وحد ٦٠/دقيقة للمندوب) ⇒ ٦٠×٥٠ = ٣٠٠٠ سؤال.
 * هنا: كل ٢٥ لوحة في سؤال واحد (`or`)، والنتيجة بتتفتكر على السيرفر شوية (المناديب
 * غالباً بيفرزوا نفس المحفظة) ⇒ ٥٠ لوحة = سؤالين.
 */

const plate = (i: number) => `ابح${String(1000 + i)}`;
const file = (name: string, id = name): DriveFile => ({ id, name });

function fakeDrive(files: DriveFile[], opts: { fail?: boolean; cap?: number } = {}) {
  const calls: string[] = [];
  const search = vi.fn(async (q: string) => {
    calls.push(q);
    if (opts.fail) return { files: [] as DriveFile[], ok: false, truncated: false };
    const digits = [...q.matchAll(/name contains '(\d+)'/g)].map((m) => m[1]);
    const hit = files.filter((f) => digits.some((d) => f.name.includes(d)));
    const cap = opts.cap ?? Infinity;
    return { files: hit.slice(0, cap), ok: true, truncated: hit.length >= cap };
  });
  return { search, calls };
}

beforeEach(() => clearCertBatchCache());

describe("🔴 دفعة واحدة بدل سؤال لكل عربية", () => {
  it("٥٠ لوحة = سؤالين لدرايف، و٨٨ = ٤ (كل ٢٥ لوحة في سؤال)", async () => {
    expect(CERT_DIGITS_PER_QUERY).toBe(25);
    const d1 = fakeDrive([]);
    await batchFindCertificates(Array.from({ length: 50 }, (_, i) => plate(i)), d1.search, 0);
    expect(d1.calls).toHaveLength(2);
    clearCertBatchCache();
    const d2 = fakeDrive([]);
    await batchFindCertificates(Array.from({ length: 88 }, (_, i) => plate(i)), d2.search, 0);
    expect(d2.calls).toHaveLength(4);
  });

  it("شكل السؤال: or بين الأرقام + PDF بس", () => {
    expect(digitsQuery(["1234", "5678"])).toBe(
      "(name contains '1234' or name contains '5678') and mimeType='application/pdf'",
    );
  });

  it("🔴 الشهادة بتطلع للعربية بتاعتها بس — الحروف لازم تطابق مش الأرقام وبس", async () => {
    const d = fakeDrive([file("ا ب ح 1234.pdf", "mine"), file("د ه و 1234.pdf", "other"), file("س ص ط 9999.pdf")]);
    const r = await batchFindCertificates(["ابح1234", "ررر5555"], d.search, 0);
    expect(r.results["ابح1234"].map((c) => c.id)).toEqual(["mine"]);
    expect(r.results["ررر5555"]).toEqual([]);
    expect(r.failed).toEqual([]);
  });

  it("نفس الأرقام لأكتر من لوحة ⇒ سؤال واحد، وكل لوحة بشهادتها", async () => {
    const d = fakeDrive([file("ا ب ح 1234.pdf", "a"), file("د ه و 1234.pdf", "b")]);
    const r = await batchFindCertificates(["ابح1234", "دهو1234"], d.search, 0);
    expect(d.calls).toHaveLength(1);
    expect(r.results["ابح1234"][0].id).toBe("a");
    expect(r.results["دهو1234"][0].id).toBe("b");
  });
});

describe("🔴 السرعة — الأسئلة لدرايف مع بعض مش واحد ورا التاني", () => {
  /**
   * المالك (٤ أكتوبر ٢٠٢٦): «ليه بيأخر كتير علي ما بيدور علي الشهايد؟». كل سؤال لدرايف
   * ثانية لتلاتة، والسيرفر كان بيستنى كل واحد يخلص قبل اللي بعده ⇒ ٨٨ عربية = ٤ أسئلة
   * ورا بعض (لحد ~١٠ث). دلوقتي بيتبعتوا مع بعض ⇒ الوقت = أبطأ سؤال لوحده.
   */
  it("🔴 ٨٨ لوحة = ٤ أسئلة شغّالين في نفس الوقت", async () => {
    let inFlight = 0, maxInFlight = 0;
    const search = vi.fn(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return { files: [] as DriveFile[], ok: true, truncated: false };
    });
    await batchFindCertificates(Array.from({ length: 88 }, (_, i) => plate(i)), search, 0);
    expect(search).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBe(4);
  });

  it("بس بحد أقصى (مانضربش درايف بعشرات الأسئلة في نفس اللحظة)", async () => {
    let inFlight = 0, maxInFlight = 0;
    const search = vi.fn(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { files: [] as DriveFile[], ok: true, truncated: false };
    });
    await batchFindCertificates(Array.from({ length: 300 }, (_, i) => plate(i)), search, 0);
    expect(search).toHaveBeenCalledTimes(12);
    expect(maxInFlight).toBeLessThanOrEqual(CERT_PARALLEL_QUERIES);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

describe("🔴 الذاكرة على السيرفر — ٦٠ مندوب بيفرزوا نفس المحفظة", () => {
  it("نفس اللوحات تاني في خلال المدة ⇒ ولا سؤال لدرايف", async () => {
    const d = fakeDrive([file("ا ب ح 1001.pdf")]);
    const plates = Array.from({ length: 50 }, (_, i) => plate(i));
    await batchFindCertificates(plates, d.search, 0);
    const first = d.calls.length;
    const r = await batchFindCertificates(plates, d.search, CERT_CACHE_TTL_MS - 1);
    expect(d.calls.length).toBe(first);
    expect(r.results[plate(1)].length).toBe(1);
  });

  it("بعد المدة بيسأل تاني (شهادة جديدة اترفعت تظهر)", async () => {
    const d = fakeDrive([]);
    await batchFindCertificates([plate(1)], d.search, 0);
    await batchFindCertificates([plate(1)], d.search, CERT_CACHE_TTL_MS + 1);
    expect(d.calls).toHaveLength(2);
  });
});

describe("🔴 فشل درايف مايتقالش «مفيش شهادة»", () => {
  it("السؤال فشل ⇒ اللوحات في failed مش في results، ومابيتفتكرش", async () => {
    const bad = fakeDrive([], { fail: true });
    const r = await batchFindCertificates([plate(1), plate(2)], bad.search, 0);
    expect(r.failed.sort()).toEqual([plate(1), plate(2)].sort());
    expect(r.results[plate(1)]).toBeUndefined();
    const good = fakeDrive([file("ا ب ح 1001.pdf")]);
    const r2 = await batchFindCertificates([plate(1)], good.search, 1);
    expect(good.calls).toHaveLength(1);           // اتسأل تاني — الفشل ماتفتكرش
    expect(r2.results[plate(1)].length).toBe(1);
  });

  it("رمية من درايف (نت) ⇒ نفس الفشل، من غير ما الطلب كله يقع", async () => {
    const r = await batchFindCertificates([plate(1)], async () => { throw new Error("net"); }, 0);
    expect(r.failed).toEqual([plate(1)]);
  });

  it("🔴 درايف رجّع أقصى عدد (النتيجة ممكن تكون ناقصة) ⇒ السؤال بيتقسم نصين لحد ما يكمل", async () => {
    const files = Array.from({ length: 30 }, (_, i) => file(`ا ب ح ${1000 + i}.pdf`, "f" + i));
    const d = fakeDrive(files, { cap: 20 });
    const plates = Array.from({ length: 30 }, (_, i) => plate(i));
    const r = await batchFindCertificates(plates, d.search, 0);
    for (const p of plates) expect(r.results[p]?.length, p).toBe(1);
    expect(r.failed).toEqual([]);
  });
});

describe("حدود الطلب", () => {
  it("أقصى عدد لوحات في الطلب الواحد", async () => {
    const d = fakeDrive([]);
    const r = await batchFindCertificates(Array.from({ length: CERT_BATCH_MAX_PLATES + 50 }, (_, i) => plate(i)), d.search, 0);
    expect(Object.keys(r.results).length).toBe(CERT_BATCH_MAX_PLATES);
  });

  it("لوحة من غير أرقام ⇒ مفيش سؤال ومفيش شهادة", async () => {
    const d = fakeDrive([]);
    const r = await batchFindCertificates(["ابح"], d.search, 0);
    expect(d.calls).toHaveLength(0);
    expect(r.results["ابح"]).toEqual([]);
  });
});
