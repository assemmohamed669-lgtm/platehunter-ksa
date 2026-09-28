import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { readAllSheetsRawStream, streamXlsxToBatches, scanHiddenRows } from "@/lib/xlsxStream";
import { dropHiddenRows, trimSheetToData, markHiddenRows } from "@/lib/xlsxRange";

/**
 * 🙈 **البرنامج مايقراش الصفوف المخفية أبداً.**
 *
 * ملف المالك (٢٩ سبتمبر ٢٠٢٦) «Initiate Repo D»: ٣١٨١ صف، وفلتر إكسيل على
 * عمود «Bucket» مخبّي **١٩٣٧** منهم (عقود منتهية/مقفولة/ملغية). البرنامج كان
 * بيقراهم كلهم كأنهم ظاهرين — فعربيات عقدها مقفول بتطلع للمندوب **مطلوبة**.
 * المالك: «انا مش عايز يقرأ المخفي ابدا».
 */

type Opts = { hidden?: number[]; name?: string };
function sheetOf(aoa: unknown[][], hidden: number[] = []): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const rows: XLSX.RowInfo[] = [];
  for (const r of hidden) rows[r] = { hidden: true };
  ws["!rows"] = rows;
  return ws;
}
function xlsxOf(sheets: { aoa: unknown[][]; opts?: Opts }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s, i) => XLSX.utils.book_append_sheet(wb, sheetOf(s.aoa, s.opts?.hidden), s.opts?.name ?? `S${i + 1}`));
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
const AOA = [
  ["رقم اللوحة", "Bucket"],
  ["ابج1111", "4MPD_Active"],
  ["دهو2222", "Closed Contracts"],
  ["زحط3333", "5MPD_Active"],
  ["كلم4444", "Expired More Than 1 Month"],
];
const plates = (aoa: unknown[][]) => aoa.map((r) => String((r as unknown[])[0]));

describe("القارئ المتدفّق (xlsx) — بيتخطّى الصفوف المخفية", () => {
  it("🔴 readAllSheetsRawStream مابيرجّعش الصف المخفي", async () => {
    const [s] = await readAllSheetsRawStream(xlsxOf([{ aoa: AOA, opts: { hidden: [2, 4] } }]));
    expect(plates(s.aoa)).toEqual(["رقم اللوحة", "ابج1111", "زحط3333"]);
  });

  it("🔴 صف العناوين بيفضل حتى لو مخفي (وإلا الملف كله يبوظ)", async () => {
    const [s] = await readAllSheetsRawStream(xlsxOf([{ aoa: AOA, opts: { hidden: [0, 2] } }]));
    expect(plates(s.aoa)).toEqual(["رقم اللوحة", "ابج1111", "زحط3333", "كلم4444"]);
  });

  it("🔴 آلاف الصفوف المخفية ورا بعض مابتوقّفش القراءة قبل الظاهر اللي بعدها", async () => {
    const big: unknown[][] = [["رقم اللوحة", "Bucket"]];
    const hidden: number[] = [];
    for (let i = 0; i < 20_500; i++) { big.push([`هدف${i}`, "Closed"]); hidden.push(i + 1); }
    big.push(["ابج9999", "4MPD_Active"]);
    const [s] = await readAllSheetsRawStream(xlsxOf([{ aoa: big, opts: { hidden } }]));
    expect(plates(s.aoa)).toEqual(["رقم اللوحة", "ابج9999"]);
  });

  it("🔴 scanHiddenRows بيطلّع أرقام الصفوف المخفية في الورقة المطلوبة بس", async () => {
    const data = xlsxOf([
      { aoa: AOA, opts: { name: "داتا", hidden: [1] } },
      { aoa: AOA, opts: { name: "داتا قديمه", hidden: [2, 4] } },
    ]);
    expect([...(await scanHiddenRows(data, "داتا قديمه"))!].sort()).toEqual([2, 4]);
    expect([...(await scanHiddenRows(data, "داتا"))!]).toEqual([1]);
    expect([...(await scanHiddenRows(xlsxOf([{ aoa: AOA }])))!]).toEqual([]);
  });

  it("scanHiddenRows بيرجّع null لو الملف مش xlsx (فالقارئ يرجع لـcellStyles)", async () => {
    const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, sheetOf(AOA, [2]), "S");
    expect(await scanHiddenRows(new Uint8Array(XLSX.write(b, { type: "array", bookType: "xlsb" }) as ArrayBuffer))).toBeNull();
    expect(await scanHiddenRows(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("🔴 المسح + markHiddenRows + trimSheetToData = نفس نتيجة cellStyles من غير تمنها", async () => {
    const data = xlsxOf([{ aoa: AOA, opts: { hidden: [2, 4] } }]);
    const wb = XLSX.read(data, { type: "array", cellStyles: false, dense: true } as XLSX.ParsingOptions);
    const ws = wb.Sheets[wb.SheetNames[0]];
    markHiddenRows(ws, (await scanHiddenRows(data))!);
    trimSheetToData(ws);
    expect(plates(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }))).toEqual(["رقم اللوحة", "ابج1111", "زحط3333"]);
  });

  it("🔴 streamXlsxToBatches (ملف الداتا الكبير) مابيعدّش الصف المخفي", async () => {
    const got: string[] = [];
    const meta = await streamXlsxToBatches(xlsxOf([{ aoa: AOA, opts: { hidden: [2, 4] } }]), (rows) => {
      for (const r of rows) got.push(r["رقم اللوحة"]);
    });
    expect(got).toEqual(["ابج1111", "زحط3333"]);
    expect(meta.rowCount).toBe(2);
  });

  it("ملف من غير صفوف مخفية بيطلع زي ما هو بالظبط", async () => {
    const [s] = await readAllSheetsRawStream(xlsxOf([{ aoa: AOA }]));
    expect(plates(s.aoa)).toEqual(plates(AOA));
  });
});

describe("SheetJS (xlsb وباقي المسارات) — dropHiddenRows", () => {
  it("🔴 بيشيل الصف المخفي ويطلّع اللي بعده مكانه", () => {
    const ws = sheetOf(AOA, [2, 4]);
    expect(dropHiddenRows(ws)).toBe(2);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    expect(plates(aoa)).toEqual(["رقم اللوحة", "ابج1111", "زحط3333"]);
    expect(ws["!ref"]).toBe("A1:B3");
  });

  it("🔴 صف العناوين بيفضل حتى لو مخفي", () => {
    const ws = sheetOf(AOA, [0, 2]);
    dropHiddenRows(ws);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    expect(plates(aoa)).toEqual(["رقم اللوحة", "ابج1111", "زحط3333", "كلم4444"]);
  });

  it("بيشتغل على الورقة الـdense كمان", () => {
    const wb = XLSX.read(XLSX.write((() => {
      const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, sheetOf(AOA, [2]), "S"); return b;
    })(), { type: "array", bookType: "xlsx" }), { type: "array", cellStyles: true, dense: true } as XLSX.ParsingOptions);
    const ws = wb.Sheets.S;
    dropHiddenRows(ws);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    expect(plates(aoa)).toEqual(["رقم اللوحة", "ابج1111", "زحط3333", "كلم4444"]);
  });

  it("بيحافظ على الروابط والدمج في الصفوف الظاهرة", () => {
    const ws = sheetOf(AOA, [1]);
    ws["D4"] = { t: "s", v: "خريطة", l: { Target: "https://maps.google.com/?q=1,2" } };
    ws["!ref"] = "A1:D5";
    ws["!merges"] = [{ s: { r: 3, c: 2 }, e: { r: 4, c: 2 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }];
    dropHiddenRows(ws);
    expect((ws["D3"] as XLSX.CellObject).l?.Target).toContain("maps");
    expect(ws["!merges"]).toEqual([{ s: { r: 2, c: 2 }, e: { r: 3, c: 2 } }]);
  });

  it("من غير صفوف مخفية مابيلمسش الورقة", () => {
    const ws = sheetOf(AOA);
    const before = JSON.stringify(ws);
    expect(dropHiddenRows(ws)).toBe(0);
    expect(JSON.stringify(ws)).toBe(before);
  });

  it("🔴 trimSheetToData (اللي كل مسارات SheetJS بتعدّي عليها) بيشيل المخفي", () => {
    const ws = sheetOf(AOA, [2]);
    trimSheetToData(ws);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    expect(plates(aoa)).not.toContain("دهو2222");
  });

  it("🔴 xlsb بيوصل بعلامة الإخفاء (cellStyles) والصف بيتشال", () => {
    const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, sheetOf(AOA, [2]), "S");
    const wb = XLSX.read(XLSX.write(b, { type: "array", bookType: "xlsb" }), { type: "array", cellStyles: true });
    const ws = wb.Sheets.S;
    trimSheetToData(ws);
    expect(plates(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }))).not.toContain("دهو2222");
  });
});

/** حارس التوصيل — كل قراءة SheetJS لازم تجيب علامة الإخفاء، والداتا متعددة الورقات تمشي متدفّقة. */
describe("توصيل «مايقراش المخفي» في كل القرّاء", () => {
  const src = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");

  for (const f of ["lib/excel.ts", "lib/parseWorkbook.ts", "lib/xlsxWorker.ts"]) {
    it(`🔴 ${f}: مفيش قراءة SheetJS بـcellStyles: false (من غيرها علامة الإخفاء مابتوصلش)`, () => {
      expect(src(...f.split("/"))).not.toMatch(/cellStyles:\s*false/);
    });
  }

  it("🔴 الـworker (الداتا متعددة الورقات): المخفي بالمسح الخفيف مش بـcellStyles", () => {
    const w = src("lib", "xlsxWorker.ts");
    expect(w).toMatch(/const hiddenScan = await scanHiddenRows\(data, sheetName\)/);
    expect(w).toMatch(/cellStyles: hiddenScan === null/);
    expect(w).toMatch(/if \(hiddenScan\) markHiddenRows\(ws, hiddenScan\)/);
  });
});
