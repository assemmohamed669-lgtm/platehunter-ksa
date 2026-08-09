import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { rtlAlignXlsxBytes, rtlAlignBlob } from "@/lib/rtlExcel";

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
