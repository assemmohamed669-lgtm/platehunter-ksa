import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { rtlAlignXlsxBytes, rtlAlignBlob, patchSheetXml } from "@/lib/rtlExcel";

/**
 * كل شيت بيطلع من البرنامج (فرز / مطلوب / سجلات / تشييك / شاص) لازم يفتح عند
 * المندوب **من اليمين**، وكل الخلايا (لوحات، مناطق، أرقام) محاذاة يمين.
 *
 * SheetJS النسخة المجانية مابتكتبش محاذاة خلايا خالص، فبنعدّل الـ XML جوه ملف
 * الـ xlsx نفسه بعد ما يتبني:
 *   • كل ورقة: rightToLeft="1" في الـ sheetView.
 *   • كل نمط في cellXfs: alignment horizontal="right" + readingOrder عربي.
 * التعديل على **الأنماط الموجودة** مش استبدالها — عشان ألوان اللوحات المكررة
 * والروابط تفضل زي ما هي.
 */

function buildSheet(rows: Record<string, unknown>[]): Uint8Array {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "نتيجة");
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

const ROWS = [
  { "رقم اللوحة": "ابح1234", "الحي": "الواحة", "عدد": 5 },
  { "رقم اللوحة": "دنر5678", "الحي": "السامر", "عدد": 12 },
];

async function unzip(bytes: Uint8Array) {
  const z = await JSZip.loadAsync(bytes);
  const read = async (p: string) => {
    const f = z.file(p);
    return f ? await f.async("string") : null;
  };
  return { z, read };
}

describe("rtlAlignXlsxBytes — الشيت يفتح من اليمين وكله محاذاة يمين", () => {
  it("بيحط rightToLeft على الورقة", async () => {
    const out = await rtlAlignXlsxBytes(buildSheet(ROWS));
    const { read } = await unzip(out);
    const xml = (await read("xl/worksheets/sheet1.xml"))!;
    expect(xml).toMatch(/rightToLeft="1"/);
  });

  it("بيحط محاذاة يمين على كل أنماط الخلايا", async () => {
    const out = await rtlAlignXlsxBytes(buildSheet(ROWS));
    const { read } = await unzip(out);
    const styles = (await read("xl/styles.xml"))!;
    const cellXfs = styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/)![0];
    const xfCount = (cellXfs.match(/<xf[\s>]/g) ?? []).length;
    const alignCount = (cellXfs.match(/<alignment [^>]*horizontal="right"/g) ?? []).length;
    expect(xfCount).toBeGreaterThan(0);
    expect(alignCount).toBe(xfCount);
    expect(cellXfs).toMatch(/readingOrder="2"/);
  });

  it("الملف الناتج لسه يتقرا صح وبنفس القيم بالظبط", async () => {
    const out = await rtlAlignXlsxBytes(buildSheet(ROWS));
    const wb = XLSX.read(out, { type: "array" });
    const back = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    expect(back).toEqual(ROWS);
    expect(wb.SheetNames).toEqual(["نتيجة"]);
  });

  it("بيشتغل على كل الورقات مش الأولى بس", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ROWS), "أ");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ROWS), "ب");
    const out = await rtlAlignXlsxBytes(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    const { read } = await unzip(out);
    expect((await read("xl/worksheets/sheet1.xml"))!).toMatch(/rightToLeft="1"/);
    expect((await read("xl/worksheets/sheet2.xml"))!).toMatch(/rightToLeft="1"/);
  });

  it("ورقة فيها rightToLeft قبل كده مابتتكررش", async () => {
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ROWS), "أ");
    const out = await rtlAlignXlsxBytes(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    const { read } = await unzip(out);
    const xml = (await read("xl/worksheets/sheet1.xml"))!;
    expect((xml.match(/rightToLeft/g) ?? []).length).toBe(1);
  });

  it("الأنماط اللي فيها محاذاة قبل كده بتتصلّح مش بتتكرر", async () => {
    // نمط فيه alignment رأسي بس — لازم يتضاف له الأفقي جوه نفس الوسم
    const bytes = buildSheet(ROWS);
    const z = await JSZip.loadAsync(bytes);
    let styles = await z.file("xl/styles.xml")!.async("string");
    styles = styles.replace(
      /<cellXfs count="(\d+)">/,
      (_m, c) => `<cellXfs count="${Number(c) + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf>`,
    );
    z.file("xl/styles.xml", styles);
    const patched = await rtlAlignXlsxBytes(await z.generateAsync({ type: "uint8array" }));
    const { read } = await unzip(patched);
    const out = (await read("xl/styles.xml"))!;
    const cellXfs = out.match(/<cellXfs[\s\S]*?<\/cellXfs>/)![0];
    expect(cellXfs).toMatch(/vertical="center"/);                       // اللي كان موجود فضل
    expect((cellXfs.match(/<alignment/g) ?? []).length)
      .toBe((cellXfs.match(/<xf[\s>]/g) ?? []).length);                  // alignment واحد لكل نمط
  });

  it("ملف مش xlsx (CSV مثلاً) بيرجع زي ما هو من غير ما يكسر", async () => {
    const csv = new Blob(["a,b\n1,2"], { type: "text/csv" });
    const out = await rtlAlignBlob(csv, "x.csv");
    expect(out).toBe(csv);
  });

  it("بايتس بايظة بترجع زي ما هي (مافيش رمي أخطاء)", async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    const out = await rtlAlignXlsxBytes(junk);
    expect(out).toBe(junk);
  });

  it("rtlAlignBlob بترجع Blob بنفس النوع", async () => {
    const type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const bytes = buildSheet(ROWS);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type });
    const out = await rtlAlignBlob(blob, "نتيجة.xlsx");
    expect(out).not.toBe(blob);
    expect(out.type).toBe(type);
    const wb = XLSX.read(new Uint8Array(await out.arrayBuffer()), { type: "array" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])).toEqual(ROWS);
  });
});

/**
 * ترتيب عناصر الورقة في مواصفة OOXML **مُلزِم**:
 *   sheetPr → dimension → sheetViews → sheetFormatPr → cols → sheetData
 *
 * كنا بنضيف <sheetViews> قبل <sheetData> على طول، فلو الورقة فيها
 * <sheetFormatPr> أو <cols> بتقع بعدهم — ملف مخالف للمواصفة. إكسيل بيصلّحه
 * في صمت، لكن **جوجل شيتس بيرفضه ويقول فيه مشكلة**، والمندوب مايقدرش يفتح
 * الشيت اللي البرنامج طلّعهوله.
 */
describe("مكان sheetViews لازم يطابق المواصفة", () => {
  const SPEC = ["sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData"];
  const orderOf = (xml: string) =>
    (xml.match(/<(sheetPr|dimension|sheetViews|sheetFormatPr|cols|sheetData)\b/g) ?? []).map((t) => t.slice(1));
  const inSpecOrder = (xml: string) => {
    const idx = orderOf(xml).map((t) => SPEC.indexOf(t));
    return idx.every((v, i) => i === 0 || idx[i - 1] <= v);
  };
  const sheet = (inner: string) =>
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${inner}</worksheet>`;

  it("بتتحط بعد dimension وقبل sheetFormatPr و cols", () => {
    const out = patchSheetXml(sheet(
      `<dimension ref="A1:B2"/><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="20"/></cols><sheetData/>`,
    ));
    expect(orderOf(out)).toEqual(["dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData"]);
    expect(inSpecOrder(out)).toBe(true);
  });

  it("بتتحط بعد sheetPr لو مافيش dimension", () => {
    const out = patchSheetXml(sheet(`<sheetPr filterMode="0"/><cols><col min="1" max="1" width="9"/></cols><sheetData/>`));
    expect(orderOf(out)).toEqual(["sheetPr", "sheetViews", "cols", "sheetData"]);
  });

  it("sheetPr المفتوح (بعناصر جوّه) مابيتكسرش", () => {
    const out = patchSheetXml(sheet(`<sheetPr><tabColor rgb="FF00FF00"/></sheetPr><sheetData/>`));
    expect(out).toContain("<tabColor");
    expect(orderOf(out)).toEqual(["sheetPr", "sheetViews", "sheetData"]);
  });

  it("مافيش sheetPr ولا dimension → في أول الورقة", () => {
    const out = patchSheetXml(sheet(`<sheetFormatPr defaultRowHeight="15"/><sheetData/>`));
    expect(orderOf(out)).toEqual(["sheetViews", "sheetFormatPr", "sheetData"]);
  });

  it("الورقة اللي فيها sheetViews أصلاً بتتعلّم بس ومكانها مايتغيّرش", () => {
    const out = patchSheetXml(sheet(
      `<dimension ref="A1"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols/><sheetData/>`,
    ));
    expect(out).toContain('rightToLeft="1"');
    expect(orderOf(out)).toEqual(["dimension", "sheetViews", "cols", "sheetData"]);
    expect(out.match(/<sheetViews/g)).toHaveLength(1);   // مافيش تكرار
  });

  it("الورقة المرقّعة قبل كده ماتتلمسش", () => {
    const already = sheet(`<sheetViews><sheetView rightToLeft="1"/></sheetViews><sheetData/>`);
    expect(patchSheetXml(already)).toBe(already);
  });
});
