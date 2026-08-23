// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { importMultiSheetData, iterateRows, getDataMeta, clearData } from "@/lib/dataStore";

// ملف داتا فيه أكتر من ورقة (زي «داتا حازم»: ورقة حالية + ورقة قديمة) + ورقة
// فرز فاضية. المندوب لازم يقدر يختار يفرز على أي ورقة أو الاتنين.
function multiSheetFile(name = "داتا.xlsx"): File {
  const wb = XLSX.utils.book_new();
  // ورقة فرز فاضية — مالهاش لوحات، المفروض تتشال من الاختيار.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ملخص"], ["إجمالي"]]), "فرز");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["رقم اللوحه", "الحي"],
      ["ابح1234", "النسيم"],
      ["دمم5012", "الملز"],
      ["سعم7788", "العليا"],
    ]),
    "داتا",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["رقم اللوحه", "الحي"],
      ["قدم1111", "قديم1"],
      ["قدم2222", "قديم2"],
    ]),
    "داتا قديمه",
  );
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], name);
}

describe("importMultiSheetData + iterateRows(sheets) — اختيار ورقات ملف الداتا", () => {
  beforeEach(async () => { await clearData("data"); });

  it("بيحلّل كل الورقات اللي فيها لوحات ويتجاهل الورقة الفاضية", async () => {
    const meta = await importMultiSheetData(multiSheetFile(), { slot: "data" });
    expect(meta.sheets).toBeDefined();
    const names = (meta.sheets ?? []).map((s) => s.name);
    expect(names).toEqual(["داتا", "داتا قديمه"]); // «فرز» الفاضية اتشالت
    expect(meta.rowCount).toBe(5); // 3 + 2

    const byName = Object.fromEntries((meta.sheets ?? []).map((s) => [s.name, s]));
    expect(byName["داتا"].plateCount).toBe(3);
    expect(byName["داتا قديمه"].plateCount).toBe(2);
    expect(byName["داتا"].plateCol).toBe("رقم اللوحه");
    expect(byName["داتا قديمه"].plateCol).toBe("رقم اللوحه");
  });

  it("الفرز على ورقة واحدة → صفوف الورقة دي بس", async () => {
    await importMultiSheetData(multiSheetFile(), { slot: "data" });
    const rows: Record<string, string>[] = [];
    await iterateRows((b) => { rows.push(...b); }, { slot: "data", sheets: new Set(["داتا"]) });
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r["رقم اللوحه"])).toEqual(["ابح1234", "دمم5012", "سعم7788"]);
  });

  it("الفرز على الورقة القديمة → صفوفها بس", async () => {
    await importMultiSheetData(multiSheetFile(), { slot: "data" });
    const rows: Record<string, string>[] = [];
    await iterateRows((b) => { rows.push(...b); }, { slot: "data", sheets: new Set(["داتا قديمه"]) });
    expect(rows.map((r) => r["رقم اللوحه"])).toEqual(["قدم1111", "قدم2222"]);
  });

  it("الفرز على الورقتين → كل الصفوف بترتيب الورقات", async () => {
    await importMultiSheetData(multiSheetFile(), { slot: "data" });
    const rows: Record<string, string>[] = [];
    await iterateRows((b) => { rows.push(...b); }, { slot: "data", sheets: new Set(["داتا", "داتا قديمه"]) });
    expect(rows.length).toBe(5);
  });

  it("من غير فلتر ورقات → كل الصفوف (سلوك متوافق مع القديم)", async () => {
    await importMultiSheetData(multiSheetFile(), { slot: "data" });
    const rows: Record<string, string>[] = [];
    await iterateRows((b) => { rows.push(...b); }, { slot: "data" });
    expect(rows.length).toBe(5);
  });

  it("onBatch بياخد اسم الورقة عشان الفرز يعرف عمود لوحة كل ورقة", async () => {
    await importMultiSheetData(multiSheetFile(), { slot: "data" });
    const seen = new Set<string>();
    await iterateRows((_b, _base, sheet) => { if (sheet) seen.add(sheet); }, { slot: "data" });
    expect([...seen].sort()).toEqual(["داتا", "داتا قديمه"]);
  });

  it("meta.sheetName والعناوين من أول ورقة فيها لوحات", async () => {
    const meta = await importMultiSheetData(multiSheetFile(), { slot: "data" });
    expect(meta.sheetName).toBe("داتا");
    expect(meta.headers).toEqual(["رقم اللوحه", "الحي"]);
    expect(meta.plateCol).toBe("رقم اللوحه");
    // متخزّنة كمان في القاعدة (تفضل بعد إعادة الفتح)
    const stored = await getDataMeta("data");
    expect((stored?.sheets ?? []).length).toBe(2);
  });
});
