import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { streamXlsxToBatches, NotXlsxWorksheetError } from "@/lib/xlsxStream";

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

// ── بناء zip بملفات جوّه محدّدة بالإيد — لمحاكاة تنويعات بنية الملفات الحقيقية
// (اسم ورقة بدون رقم، بادئة namespace، حروف كبيرة، ...) اللي SheetJS بيقراها.
async function buildZip(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "uint8array" });
}

// ورقة بخلايا inlineStr، مع بادئة عناصر اختيارية (زي "x:").
function sheetXml(rows: string[][], p = ""): string {
  const body = rows
    .map((row, ri) => {
      const cells = row
        .map((v, ci) =>
          `<${p}c r="${String.fromCharCode(65 + ci)}${ri + 1}" t="inlineStr">` +
          `<${p}is><${p}t>${v}</${p}t></${p}is></${p}c>`
        )
        .join("");
      return `<${p}row r="${ri + 1}">${cells}</${p}row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><${p}worksheet xmlns:x="http://x"><${p}sheetData>${body}</${p}sheetData></${p}worksheet>`;
}

function workbookXml(sheetName: string, opts: { prefix?: string; ridAttr?: string } = {}): string {
  const p = opts.prefix ?? "";
  const rid = opts.ridAttr ?? "r:id";
  return `<?xml version="1.0" encoding="UTF-8"?><${p}workbook xmlns:r="http://r" xmlns:rel="http://r" xmlns:x="http://x">` +
    `<${p}sheets><${p}sheet name="${sheetName}" sheetId="1" ${rid}="rId1"/></${p}sheets></${p}workbook>`;
}

const relsXml = (target: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships><Relationship Id="rId1" Type="ws" Target="${target}"/></Relationships>`;

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

  // ── تنويعات بنية الملف (ملفات المناديب الحقيقية مش كلها بنفس البنية القياسية) ──

  it("ورقة اسمها sheet.xml (بدون رقم) و r:id ببادئة تانية → يقراها عادي", async () => {
    const buf = await buildZip({
      "xl/workbook.xml": workbookXml("داتا جديد", { ridAttr: "rel:id" }),
      "xl/_rels/workbook.xml.rels": relsXml("worksheets/sheet.xml"),
      "xl/worksheets/sheet.xml": sheetXml([
        ["رقم اللوحه", "الحي"],
        ["ابح1234", "النسيم"],
        ["دمم5012", "الملز"],
      ]),
    });
    const { rows, meta } = await collect(buf);
    expect(meta.rowCount).toBe(2);
    expect(meta.sheetName).toBe("داتا جديد");
    expect(rows[0]["رقم اللوحه"]).toBe("ابح1234");
    expect(rows[1]["الحي"]).toBe("الملز");
  });

  it("عناصر بـ namespace prefix (x:row / x:c / x:sheet) → يقرا الصفوف مش صفر", async () => {
    const buf = await buildZip({
      "xl/workbook.xml": workbookXml("داتا", { prefix: "x:" }),
      "xl/_rels/workbook.xml.rels": relsXml("worksheets/sheet1.xml"),
      "xl/worksheets/sheet1.xml": sheetXml([
        ["رقم اللوحه", "الحي"],
        ["ابح1234", "النسيم"],
      ], "x:"),
    });
    const { rows, meta } = await collect(buf);
    expect(meta.headers).toEqual(["رقم اللوحه", "الحي"]);
    expect(meta.rowCount).toBe(1);
    expect(rows[0]["رقم اللوحه"]).toBe("ابح1234");
  });

  it("حروف كبيرة في اسم الورقة (Sheet1.xml) بدون rels → لقطة احتياطية بتلاقيها", async () => {
    const buf = await buildZip({
      "xl/worksheets/Sheet1.xml": sheetXml([
        ["رقم اللوحه"],
        ["ابح1234"],
      ]),
    });
    const { rows, meta } = await collect(buf);
    expect(meta.rowCount).toBe(1);
    expect(rows[0]["رقم اللوحه"]).toBe("ابح1234");
  });

  it("ملف xlsb (zip سليم بس ورقته .bin) → خطأ يسمّي الصيغة ويقترح الحل", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["رقم اللوحه"], ["ابح1234"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "داتا");
    const buf = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsb" }) as ArrayBuffer);

    let err: unknown = null;
    try { await collect(buf); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(NotXlsxWorksheetError);
    const msg = (err as Error).message;
    expect(msg).toMatch(/xlsb/i);   // يقول الصيغة الحقيقية
    expect(msg).toMatch(/xlsx/i);   // ويقترح الحفظ كـ xlsx
  });

  it("ملف ods → خطأ يسمّي الصيغة", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["رقم اللوحه"], ["ابح1234"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "داتا");
    const buf = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "ods" }) as ArrayBuffer);

    let err: unknown = null;
    try { await collect(buf); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(NotXlsxWorksheetError);
    expect((err as Error).message).toMatch(/ods/i);
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
