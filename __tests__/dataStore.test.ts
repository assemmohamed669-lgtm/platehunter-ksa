// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { importLargeDataFile, iterateRows, getSampleRows, getDataMeta, clearData } from "@/lib/dataStore";

function xlsxFile(aoa: unknown[][], name = "big.xlsx"): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "داتا");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], name);
}

async function collectAll(): Promise<Record<string, string>[]> {
  const all: Record<string, string>[] = [];
  await iterateRows((b) => { all.push(...b); }, { slot: "data" });
  return all;
}

describe("dataStore (IndexedDB على الجهاز — dep دفعات)", () => {
  beforeEach(async () => { await clearData("data"); });

  it("استيراد → لفّ على الكل بالترتيب → عيّنة → ميتا → مسح", async () => {
    const aoa = [
      ["رقم اللوحه", "الحي", "المندوب"],
      ["أبح1234", "النسيم", "عادل"],
      ["دمم5012", "الملز", "احمد"],
      ["أبح1234", "العليا", "سعد"],
    ];
    const meta = await importLargeDataFile(xlsxFile(aoa), { slot: "data" });
    expect(meta.rowCount).toBe(3);
    expect(meta.plateCol).toBe("رقم اللوحه");

    const all = await collectAll();
    expect(all.length).toBe(3);
    // الترتيب محفوظ زي ملف الداتا
    expect(all.map((r) => r["الحي"])).toEqual(["النسيم", "الملز", "العليا"]);

    expect((await getSampleRows(2)).length).toBe(2);
    expect((await getDataMeta("data"))?.rowCount).toBe(3);

    await clearData("data");
    expect(await getDataMeta("data")).toBeNull();
    expect((await collectAll()).length).toBe(0);
  });

  it("استيراد جديد بيستبدل القديم (مايتراكمش)", async () => {
    await importLargeDataFile(xlsxFile([["رقم اللوحه", "الحي"], ["اول1111", "حي"]]), { slot: "data" });
    const meta2 = await importLargeDataFile(xlsxFile([["رقم اللوحه", "الحي"], ["تان2222", "حي"], ["تان3333", "حي"]]), { slot: "data" });
    expect(meta2.rowCount).toBe(2);
    const all = await collectAll();
    expect(all.length).toBe(2);
    expect(all.map((r) => r["رقم اللوحه"])).toEqual(["تان2222", "تان3333"]);
  });

  it("لفّ على دفعات متعددة (baseIndex متتابع)", async () => {
    // ملف أكبر من حجم الدفعة (10000) عشان يتخزّن في أكتر من chunk
    const aoa: unknown[][] = [["رقم اللوحه", "الحي"]];
    for (let i = 0; i < 12000; i++) aoa.push([`لوح${i}`, `حي ${i % 5}`]);
    const meta = await importLargeDataFile(xlsxFile(aoa), { slot: "data" });
    expect(meta.rowCount).toBe(12000);
    const bases: number[] = [];
    let total = 0;
    await iterateRows((b, base) => { bases.push(base); total += b.length; }, { slot: "data" });
    expect(total).toBe(12000);
    expect(bases[0]).toBe(0);
    expect(bases.length).toBeGreaterThanOrEqual(2); // اتقسّمت لأكتر من دفعة
  });
});
