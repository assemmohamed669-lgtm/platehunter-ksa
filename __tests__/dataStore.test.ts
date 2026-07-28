// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { importLargeDataFile, lookupByPlate, iterateRows, getSampleRows, getDataMeta, clearData } from "@/lib/dataStore";

function xlsxFile(aoa: unknown[][], name = "big.xlsx"): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "داتا");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], name);
}

describe("dataStore (IndexedDB على الجهاز)", () => {
  beforeEach(async () => { await clearData("data"); });

  it("استيراد → بحث بلوحة → لفّ → عيّنة → ميتا → مسح", async () => {
    const aoa = [
      ["رقم اللوحه", "الحي", "المندوب"],
      ["أبح1234", "النسيم", "عادل"],
      ["دمم5012", "الملز", "احمد"],
      ["أبح1234", "العليا", "سعد"], // نفس اللوحة مرتين (موقعين)
    ];
    const meta = await importLargeDataFile(xlsxFile(aoa), { slot: "data" });
    expect(meta.rowCount).toBe(3);
    expect(meta.plateCol).toBe("رقم اللوحه");

    // بحث بلوحة مطبّعة (أ→ا) — لازم يرجّع الظهورين بموقعيهما
    const hits = await lookupByPlate("ابح1234", "data");
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.data["الحي"]).sort()).toEqual(["العليا", "النسيم"]);
    expect(hits.every((h) => typeof h.idx === "number")).toBe(true);

    // لوحة غير موجودة
    expect((await lookupByPlate("زيتون9999", "data")).length).toBe(0);

    // لفّ على كل الصفوف (دفعات صغيرة)
    const all: Record<string, string>[] = [];
    await iterateRows((b) => { all.push(...b); }, { slot: "data", batchSize: 2 });
    expect(all.length).toBe(3);

    // عيّنة
    expect((await getSampleRows(2, "data")).length).toBe(2);

    // ميتا
    expect((await getDataMeta("data"))?.rowCount).toBe(3);

    // مسح
    await clearData("data");
    expect(await getDataMeta("data")).toBeNull();
    expect((await lookupByPlate("ابح1234", "data")).length).toBe(0);
  });

  it("استيراد جديد بيستبدل القديم (مايتراكمش)", async () => {
    await importLargeDataFile(xlsxFile([["رقم اللوحه", "الحي"], ["اول1111", "حي"]]), { slot: "data" });
    const meta2 = await importLargeDataFile(xlsxFile([["رقم اللوحه", "الحي"], ["تان2222", "حي"], ["تان3333", "حي"]]), { slot: "data" });
    expect(meta2.rowCount).toBe(2);
    expect((await lookupByPlate("اول1111", "data")).length).toBe(0); // القديم اتمسح
    const all: Record<string, string>[] = [];
    await iterateRows((b) => { all.push(...b); }, { slot: "data" });
    expect(all.length).toBe(2);
  });
});
