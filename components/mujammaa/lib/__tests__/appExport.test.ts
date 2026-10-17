/**
 * 🧮 تصدير المجمّع في قناص — Excel/CSV بنفس فتح ومشاركة التطبيق.
 *
 * المعمل بينزّل بـ`<a download href="blob:…">` — جوّه التطبيق (أندرويد/آيفون) ده مابيعملش
 * حاجة خالص. فالأزرار بتبني نفس الملف بالظبط (`buildEntriesXlsxBlob` / نفس صفوف CSV) وتديه
 * لـ`openExcelBlob` (بيفتحه في برنامج الإكسيل على الموبايل، وبينزّله في المتصفّح) و
 * `shareExcelBlob` (واتساب…). أي فشل بيروح لسجل الأخطاء بسببه.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ open: [] as Array<{ blob: Blob; name: string }>, share: [] as Array<{ blob: Blob; name: string; title: string }>, fail: null as Error | null }));
vi.mock("@/lib/excel", () => ({
  openExcelBlob: async (blob: Blob, name: string) => { if (calls.fail) throw calls.fail; calls.open.push({ blob, name }); return "opened"; },
  shareExcelBlob: async (blob: Blob, name: string, title: string) => { if (calls.fail) throw calls.fail; calls.share.push({ blob, name, title }); },
}));

import { makePlateEntry } from "../plateEntry";
import { extractPlates } from "../plateReview";
import { openEntriesCsv, openEntriesExcel, shareEntriesExcel } from "../appExport";

function entry(plate: string) {
  const [review] = extractPlates(plate);
  return makePlateEntry({ review, pin: null, match: { kind: "none", similarity: 0 }, source: "batch", capturedAt: 1_700_000_000_000 });
}

beforeEach(() => { calls.open.length = 0; calls.share.length = 0; calls.fail = null; });

describe("تصدير المجمّع", () => {
  it("Excel ⇒ openExcelBlob بملف xlsx باسم «تفريغ_مجمع_…»", async () => {
    const errs: string[] = [];
    await openEntriesExcel([entry("ابح1234")], null, "تفريغ_مجمع", (m) => errs.push(m));
    expect(errs).toEqual([]);
    expect(calls.open).toHaveLength(1);
    expect(calls.open[0].name).toMatch(/^تفريغ_مجمع_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/);
    expect(calls.open[0].blob.type).toContain("spreadsheetml");
    expect(calls.open[0].blob.size).toBeGreaterThan(100);
  });

  it("CSV ⇒ openExcelBlob بملف csv فيه BOM عشان العربي", async () => {
    await openEntriesCsv([entry("ابح1234")], null, "تفريغ_مجمع", () => {});
    expect(calls.open[0].name).toMatch(/\.csv$/);
    expect(calls.open[0].blob.type).toContain("text/csv");
    const bytes = new Uint8Array(await calls.open[0].blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("مشاركة ⇒ shareExcelBlob بنفس ملف الإكسيل", async () => {
    await shareEntriesExcel([entry("ابح1234")], null, "تفريغ_مجمع", () => {});
    expect(calls.share).toHaveLength(1);
    expect(calls.share[0].name).toMatch(/\.xlsx$/);
    expect(calls.share[0].title).toContain("المجمّع");
  });

  it("الفشل (مثلاً مافيش برنامج إكسيل) ⇒ سجل الأخطاء بسببه، مابيرميش", async () => {
    calls.fail = new Error("تعذّر فتح ملف Excel: No app");
    const errs: string[] = [];
    await expect(openEntriesExcel([entry("ابح1234")], null, "x", (m) => errs.push(m))).resolves.toBeUndefined();
    expect(errs[0]).toContain("No app");
  });
});
