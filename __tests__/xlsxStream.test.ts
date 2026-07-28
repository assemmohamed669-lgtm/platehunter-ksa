import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { streamXlsxToBatches } from "@/lib/xlsxStream";

// يبني ملف xlsx في الذاكرة من مصفوفة صفوف
function buildXlsx(aoa: unknown[][], sheetName = "داتا"): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out as ArrayBuffer);
}

// مرجع SheetJS: نفس اللي بيستخدمه التطبيق حالياً (object rows، أول صف = مفاتيح)
function sheetjsRows(buf: Uint8Array): Record<string, string>[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false, defval: "" });
}

async function collect(buf: Uint8Array, batchSize = 5000) {
  const rows: Record<string, string>[] = [];
  let batches = 0;
  const meta = await streamXlsxToBatches(buf, (b) => { rows.push(...b); batches++; }, { batchSize });
  return { rows, batches, meta };
}

const norm = (r: Record<string, string>) => {
  const o: Record<string, string> = {};
  for (const k of Object.keys(r)) o[k] = String(r[k] ?? "").replace(/\s+/g, "");
  return o;
};

describe("streamXlsxToBatches", () => {
  it("يقرا كل الصفوف بنفس نتيجة SheetJS (نصوص/أرقام)", async () => {
    const aoa = [
      ["رقم اللوحه", "الحي", "المندوب"],
      ["سسع3880", "النسيم الغربي", "عادل"],
      ["اوا1123", "النسيم الغربي", "عادل"],
      ["333333", "الملز", "احمد"],
    ];
    const buf = buildXlsx(aoa);
    const { rows, meta } = await collect(buf);
    const expected = sheetjsRows(buf);

    expect(meta.headers).toEqual(["رقم اللوحه", "الحي", "المندوب"]);
    expect(meta.rowCount).toBe(3);
    expect(rows.length).toBe(expected.length);
    expect(rows.map(norm)).toEqual(expected.map(norm));
  });

  it("يطبّق تنسيق التاريخ زي SheetJS (مش رقم تسلسلي خام)", async () => {
    const aoa = [
      ["رقم اللوحه", "تاريخ التسجيل"],
      ["دمم5012", new Date(2026, 6, 4)],
    ];
    const buf = buildXlsx(aoa);
    const { rows } = await collect(buf);
    const expected = sheetjsRows(buf);
    // لازم يطابق تنسيق SheetJS بالظبط، ومايكونش رقم تسلسلي (زي 46000+)
    expect(rows[0]["تاريخ التسجيل"]).toBe(expected[0]["تاريخ التسجيل"]);
    expect(rows[0]["تاريخ التسجيل"]).not.toMatch(/^\d{5}$/);
  });

  it("يتخطّى الصفوف الفاضية", async () => {
    const aoa = [
      ["رقم اللوحه", "الحي"],
      ["أ ب ح 1234", "حي 1"],
      ["", ""],
      ["دطه5694", "حي 2"],
    ];
    const buf = buildXlsx(aoa);
    const { rows, meta } = await collect(buf);
    expect(meta.rowCount).toBe(2);
    expect(rows.map((r) => r["رقم اللوحه"])).toEqual(["أ ب ح 1234", "دطه5694"]);
  });

  it("الدفعات + backpressure: بيسلّم كل الصفوف بالترتيب على دفعات", async () => {
    const aoa: unknown[][] = [["رقم اللوحه", "الحي"]];
    for (let i = 0; i < 25; i++) aoa.push([`لوح${1000 + i}`, `حي ${i}`]);
    const buf = buildXlsx(aoa);
    const { rows, batches, meta } = await collect(buf, 10); // دفعات من 10
    expect(meta.rowCount).toBe(25);
    expect(rows.length).toBe(25);
    expect(batches).toBeGreaterThanOrEqual(3); // 10 + 10 + 5
    expect(rows[0]["رقم اللوحه"]).toBe("لوح1000");
    expect(rows[24]["رقم اللوحه"]).toBe("لوح1024");
  });

  it("عمود بلا عنوان → مفتاح __EMPTY (زي SheetJS)", async () => {
    const aoa = [
      ["رقم اللوحه", "", "الحي"],
      ["سسع3880", "ملاحظة", "النسيم"],
    ];
    const buf = buildXlsx(aoa);
    const { rows } = await collect(buf);
    const expected = sheetjsRows(buf);
    expect(Object.keys(rows[0]).sort()).toEqual(Object.keys(expected[0]).sort());
    // العمود بلا عنوان: نفس مفتاح SheetJS بالظبط، والقيمة تحته صح
    const blankKey = Object.keys(expected[0]).find((k) => k !== "رقم اللوحه" && k !== "الحي")!;
    expect(rows[0][blankKey]).toBe("ملاحظة");
  });
});
