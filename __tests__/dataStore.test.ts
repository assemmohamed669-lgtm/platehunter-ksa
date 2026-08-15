// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { importLargeDataFile, importRowsToData, iterateRows, getSampleRows, getDataMeta, clearData } from "@/lib/dataStore";
import { tokenizePastedPlates, matchTokensAgainstRows } from "@/lib/plateParser";

function xlsxFile(aoa: unknown[][], name = "big.xlsx"): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "داتا");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], name);
}

// ملف بصيغة تانية (اللي المندوب بيرفعها فعلاً) — xlsb / xls / ods.
function otherFormatFile(aoa: unknown[][], bookType: "xlsb" | "biff8" | "ods", name: string): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "داتا");
  const out = XLSX.write(wb, { type: "array", bookType }) as ArrayBuffer;
  return new File([out], name);
}

// ملف بورقتين: الأولى فاضية (زي ورقة «فرز») والتانية فيها الداتا.
function twoSheetFile(dataAoa: unknown[][], name = "big.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "فرز");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataAoa), "داتا جديد");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], name);
}

const PLATE_AOA = [
  ["رقم اللوحه", "الحي"],
  ["ابح1234", "النسيم"],
  ["دمم5012", "الملز"],
  ["سعم7788", "العليا"],
];

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

  it("مسار «لصق»: لفّ على القاعدة + مطابقة التوكنز يلاقي اللوحات الموجودة", async () => {
    const aoa = [
      ["رقم اللوحه", "الحي"],
      ["أبح1234", "حي1"],
      ["دمم5012", "حي2"],
      ["سعم7788", "حي3"],
    ];
    await importLargeDataFile(xlsxFile(aoa), { slot: "data" });
    const tokens = tokenizePastedPlates("أبح1234\nدمم5012\nزيتون9999");
    const matches: { converted: string; dataIdx: number }[] = [];
    let base = 0;
    await iterateRows((batch) => {
      for (const m of matchTokensAgainstRows(tokens, batch, "رقم اللوحه")) {
        matches.push({ ...m, dataIdx: m.dataIdx + base });
      }
      base += batch.length;
    }, { slot: "data" });
    // لقى اللوحتين الموجودتين، وتجاهل غير الموجودة
    expect(matches.length).toBe(2);
  });

  // ── احتياطي الصيغ: قارئ الدفعات بيفهم xlsx بس. أي صيغة تانية لازم ترجع
  //    للقارئ العادي (SheetJS) بدل ما ترمي «تعذّر إيجاد ورقة بيانات في الملف».
  it("ملف xlsb (ورقته .bin) → يرجع للقارئ العادي ويستورد الصفوف", async () => {
    const meta = await importLargeDataFile(otherFormatFile(PLATE_AOA, "xlsb", "داتا.xlsb"), { slot: "data" });
    expect(meta.rowCount).toBe(3);
    expect(meta.plateCol).toBe("رقم اللوحه");
    const all = await collectAll();
    expect(all.map((r) => r["رقم اللوحه"])).toEqual(["ابح1234", "دمم5012", "سعم7788"]);
  });

  it("ملف xls قديم (مش zip خالص) → يرجع للقارئ العادي ويستورد الصفوف", async () => {
    const meta = await importLargeDataFile(otherFormatFile(PLATE_AOA, "biff8", "داتا.xls"), { slot: "data" });
    expect(meta.rowCount).toBe(3);
    expect((await collectAll()).length).toBe(3);
  });

  it("ملف ods → يرجع للقارئ العادي ويستورد الصفوف", async () => {
    const meta = await importLargeDataFile(otherFormatFile(PLATE_AOA, "ods", "داتا.ods"), { slot: "data" });
    expect(meta.rowCount).toBe(3);
    expect((await collectAll()).length).toBe(3);
  });

  it("أول ورقة فاضية والداتا في التانية → مايرجعش صفر صفوف", async () => {
    const meta = await importLargeDataFile(twoSheetFile(PLATE_AOA), { slot: "data" });
    expect(meta.rowCount).toBe(3);
    expect(meta.plateCol).toBe("رقم اللوحه");
    expect(meta.sheetName).toBe("داتا جديد");
    expect((await collectAll()).length).toBe(3);
  });

  it("ملف مش جدول بيانات خالص → رسالة عربية مفهومة (مش خطأ jszip إنجليزي)", async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "صورة.xlsx");
    let err: unknown = null;
    try { await importLargeDataFile(junk, { slot: "data" }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/الملف|تعذّر/);           // عربي
    expect((err as Error).message).not.toMatch(/central directory/i); // مش خطأ jszip
    expect(await getDataMeta("data")).toBeNull();
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

/**
 * زرار «حدّث داتا البرنامج» في صفحة «رفع للداتا» — بيكتب الصفوف المدموجة
 * اللي في الذاكرة على طول، من غير ما يكتب ملف ويقراه تاني (ده كان بياخد
 * ٦ ثواني و٢.٤ جيجا على ملف الـ ٤٨١ ألف صف).
 */
describe("importRowsToData — تحديث داتا البرنامج", () => {
  beforeEach(async () => { await clearData(); });

  const H = ["رقم اللوحة", "نوع السيارة", "الحى"];
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
    "رقم اللوحة": `ا ب ج ${1000 + i}`, "نوع السيارة": "ونيت", "الحى": "الصفا",
  }));

  it("بيكتب كل الصفوف ويقدر يقراها تاني", async () => {
    const meta = await importRowsToData(mk(25_000), H);
    expect(meta.rowCount).toBe(25_000);
    expect(meta.headers).toEqual(H);

    let seen = 0;
    let first = "";
    await iterateRows((batch) => { if (!seen) first = String(batch[0]["رقم اللوحة"]); seen += batch.length; });
    expect(seen).toBe(25_000);
    expect(first).toBe("ا ب ج 1000");
  });

  it("بيكتشف عمود اللوحة", async () => {
    expect((await importRowsToData(mk(10), H)).plateCol).toBe("رقم اللوحة");
  });

  it("بيمسح القديم الأول — مافيش خلط بين استيرادين", async () => {
    await importRowsToData(mk(30), H);
    await importRowsToData(mk(7), H);
    let seen = 0;
    await iterateRows((b) => { seen += b.length; });
    expect(seen).toBe(7);
    expect((await getDataMeta())?.rowCount).toBe(7);
  });

  it("صفوف فاضية → مافيش داتا (مش داتا بايظة)", async () => {
    const meta = await importRowsToData([], H);
    expect(meta.rowCount).toBe(0);
    let seen = 0;
    await iterateRows((b) => { seen += b.length; });
    expect(seen).toBe(0);
  });

  it("بيسجّل اسم الملف عشان المندوب يعرف داتا مين اللي عنده", async () => {
    const meta = await importRowsToData(mk(3), H, { fileName: "داتا-محدّثة-اختبار.xlsx" });
    expect(meta.fileName).toBe("داتا-محدّثة-اختبار.xlsx");
    expect((await getDataMeta())?.fileName).toBe("داتا-محدّثة-اختبار.xlsx");
  });
});
