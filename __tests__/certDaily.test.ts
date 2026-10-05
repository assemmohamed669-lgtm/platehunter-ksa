import { describe, it, expect, vi } from "vitest";
import { riyadhDayStart, dayMinus, dedupeDailyCerts, type DailyCertEntry } from "@/lib/certDaily";
import { certDailyTick, MAX_TRIES, type CertDailyDeps, type PendingCert, type CertDailyRow } from "@/lib/certDailyJob";
import type { CertFields } from "@/lib/certParse";
import type { StatFile } from "@/lib/certStats";

/**
 * 📄 «شهايد النهارده» — المالك (٥ أكتوبر ٢٠٢٦): «احنا هنخلي الفرز علي الشهايد اللي بتنزل يومي …
 * انهردة يفرز علي ال 690 شهادة دول بس».
 */
describe("النهارده بتوقيت السعودية", () => {
  it("🔴 اليوم بيبدأ ١٢ بالليل في السعودية (٩ بالليل جرينتش)", () => {
    expect(riyadhDayStart(new Date("2026-10-05T20:59:59Z"))).toEqual({ day: "2026-10-05", startIso: "2026-10-04T21:00:00.000Z" });
    expect(riyadhDayStart(new Date("2026-10-05T21:00:00Z"))).toEqual({ day: "2026-10-06", startIso: "2026-10-05T21:00:00.000Z" });
    expect(dayMinus("2026-10-05", 7)).toBe("2026-09-28");
  });
});

const entry = (o: Partial<DailyCertEntry>): DailyCertEntry => ({
  fileId: "f", name: "", createdAt: "2026-10-05T05:00:00.000Z", plate: "", plateText: "", vin: "", bank: "", make: "",
  model: "", year: "", color: "", status: "", certDate: "", ...o,
});

describe("🔴 نفس الشهادة من كذا شركة ⇒ مرة واحدة", () => {
  it("الأغنى بالبيانات بتكسب، ولو زي بعض الأحدث · من غير لوحة بالشاص · من غير الاتنين بتتشال", () => {
    const out = dedupeDailyCerts([
      entry({ fileId: "a", plate: "ابح1234", bank: "مصرف الراجحي" }),
      entry({ fileId: "b", plate: "ابح1234", bank: "مصرف الراجحي", make: "تويوتا", vin: "1HGCM82633A004352" }),
      entry({ fileId: "c", plate: "دهو5678", createdAt: "2026-10-05T04:00:00.000Z" }),
      entry({ fileId: "d", plate: "دهو5678", createdAt: "2026-10-05T06:00:00.000Z" }),
      entry({ fileId: "e", vin: "KMHLN41E8RU000001" }),
      entry({ fileId: "f" }),
    ]);
    expect(out.map((e) => e.fileId).sort()).toEqual(["b", "d", "e"]);
  });
});

function fakes(over: Partial<CertDailyDeps> = {}) {
  const inserted: unknown[] = [];
  const saved: { id: string; fields: CertFields | null; tries: number; done: boolean }[] = [];
  const cleaned: string[] = [];
  let pendingList: PendingCert[] = [];
  const files: StatFile[] = Array.from({ length: 3 }, (_, i) => ({
    id: `id${i}`, name: `ر ل ي 837${i}.pdf`, createdTime: `2026-10-05T0${i}:00:00.000Z`,
    owners: [{ displayName: "ماني", emailAddress: "m@mani.sa" }],
  }));
  const d: CertDailyDeps = {
    now: () => new Date("2026-10-05T09:00:00Z"),
    listSince: vi.fn(async (since: string, token?: string) => (token ? { files: files.slice(2), next: null } : { files: files.slice(0, 2), next: "T2" })),
    insertNew: vi.fn(async (rows: CertDailyRow[]) => { inserted.push(...rows); pendingList = [...pendingList, ...rows.map((r) => ({ file_id: r.file_id, name: r.name, tries: 0 }))]; }),
    pending: vi.fn(async () => pendingList),
    download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    extractText: vi.fn(async () => "رقم اللوحة: ر ل ي 8370\nالمصنع: تويوتا"),
    saveParsed: vi.fn(async (id, fields, tries, done) => { saved.push({ id, fields, tries, done }); }),
    cleanup: vi.fn(async (before) => { cleaned.push(before); }),
    budgetMs: 60_000,
    concurrency: 2,
    ...over,
  };
  return { d, inserted, saved, cleaned };
}

describe("🔴 دورة السيرفر", () => {
  it("🔴 شهايد النهارده (من ١٢ بالليل) بتتضاف — كل الصفحات — باللي رفعها", async () => {
    const { d, inserted } = fakes();
    const r = await certDailyTick(d);
    expect(d.listSince).toHaveBeenCalledWith("2026-10-04T21:00:00.000Z", undefined);
    expect(d.listSince).toHaveBeenCalledWith("2026-10-04T21:00:00.000Z", "T2");
    expect(r.listed).toBe(3);
    expect(inserted[0]).toEqual({ file_id: "id0", day: "2026-10-05", created_at: "2026-10-05T00:00:00.000Z", name: "ر ل ي 8370.pdf", uploader: "m@mani.sa" });
  });

  it("🔴 كل شهادة بتتقرا مرة واحدة: الملف ⇒ الكلام ⇒ البيانات", async () => {
    const { d, saved } = fakes();
    const r = await certDailyTick(d);
    expect(r.parsed).toBe(3);
    expect(saved).toHaveLength(3);
    expect(saved[0]).toMatchObject({ tries: 1, done: true, fields: { plate: "رلي8370", make: "تويوتا" } });
  });

  it("🔴 الملف مانزلش ⇒ بيتعاد الدورة الجاية · آخر محاولة ⇒ اللي في اسم الملف", async () => {
    const { d, saved } = fakes({ download: vi.fn(async () => null) });
    await certDailyTick(d);
    expect(saved.every((s) => s.fields === null && !s.done && s.tries === 1)).toBe(true);

    const last = fakes({ download: vi.fn(async () => null) });
    last.d.pending = vi.fn(async () => [{ file_id: "x", name: "ر ل ي 8371.pdf", tries: MAX_TRIES - 1 }]);
    await certDailyTick(last.d);
    expect(last.saved[0]).toMatchObject({ id: "x", tries: MAX_TRIES, done: true, fields: { plate: "رلي8371" } });
  });

  it("الكلام مفيهوش لوحة ولا شاص ⇒ بيتعاد (يمكن الملف لسه بيترفع)", async () => {
    const { d, saved } = fakes({ extractText: vi.fn(async () => "") });
    d.pending = vi.fn(async () => [{ file_id: "x", name: "scan.pdf", tries: 0 }]);
    await certDailyTick(d);
    expect(saved[0]).toMatchObject({ fields: null, done: false, tries: 1 });
  });

  it("اللي أقدم من أسبوع بيتمسح", async () => {
    const { d, cleaned } = fakes();
    await certDailyTick(d);
    expect(cleaned).toEqual(["2026-09-28"]);
  });
});
