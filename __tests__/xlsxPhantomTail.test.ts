import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { readAllSheetsRawStream } from "@/lib/xlsxStream";

/**
 * محافظ البنوك بتيجي بـ«ذيل وهمي»: صفوف الداتا في الأول، وبعدها مئات الآلاف من
 * الصفوف **الفاضية المتنسّقة**. «محفظة البنك العربي» مثال حقيقي: ١٦٧٥ صف داتا
 * و٩٩٧ ألف صف فاضي، وحجم الـXML ١٠٦ ميجا.
 *
 * القارئ بيوقف بعد ٢٠ ألف صف فاضي ورا بعض — فبيقرا ~٢٪ من الملف بدل ١٠٠٪.
 * ده اللي خلّى فتح المحفظة من واتساب ياخد جزء من الثانية بدل ثواني طويلة.
 */

/** يبني ملف xlsx بإيدينا عشان نتحكّم في وسوم <row> الفاضية بالظبط. */
async function buildWithEmptyTail(
  dataRows: string[][],
  emptyTail: number,
  tailRows: string[][] = [],
): Promise<Uint8Array> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  let r = 1;
  let sheet = "";
  for (const row of dataRows) {
    sheet += `<row r="${r}">` + row.map((v, i) =>
      `<c r="${col(i)}${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join("") + `</row>`;
    r++;
  }
  for (let i = 0; i < emptyTail; i++) { sheet += `<row r="${r}" s="1" customFormat="1"/>`; r++; }
  for (const row of tailRows) {
    sheet += `<row r="${r}">` + row.map((v, i) =>
      `<c r="${col(i)}${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join("") + `</row>`;
    r++;
  }

  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:D${r}"/><sheetData>${sheet}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array" });
}

const DATA = [
  ["PLATE_NUM", "MODEL"],
  ["ا ب ح 1234", "لاندكروزر"],
  ["د ن ر 5678", "باترول"],
];

describe("الذيل الوهمي — القراءة بتقف بعد الصفوف الفاضية", () => {
  it("الداتا كلها بترجع والذيل الوهمي بيتجاهل", async () => {
    const [s] = await readAllSheetsRawStream(await buildWithEmptyTail(DATA, 60_000));
    expect(s.aoa).toHaveLength(3);
    expect(s.aoa[1]).toEqual(["ا ب ح 1234", "لاندكروزر"]);
  });

  it("فجوة أصغر من الحد مابتقطعش الداتا اللي بعدها", async () => {
    // ١٠٠٠ صف فاضي في النص — أقل من الحد (٢٠ ألف) فالباقي لازم يتقرا
    const [s] = await readAllSheetsRawStream(
      await buildWithEmptyTail(DATA, 1_000, [["ر ل د 6202", "هايلكس"]]),
    );
    expect(s.aoa).toHaveLength(4);
    expect(s.aoa[3]).toEqual(["ر ل د 6202", "هايلكس"]);
  });

  it("بيقرا الملف كله لو مفيش ذيل وهمي", async () => {
    const [s] = await readAllSheetsRawStream(await buildWithEmptyTail(DATA, 0));
    expect(s.aoa).toHaveLength(3);
  });

  it("الوقفة بتوفّر وقت حقيقي على ذيل ضخم", async () => {
    const bytes = await buildWithEmptyTail(DATA, 400_000);
    const t = Date.now();
    const [s] = await readAllSheetsRawStream(bytes);
    const ms = Date.now() - t;
    expect(s.aoa).toHaveLength(3);
    // ٤٠٠ ألف صف فاضي — من غير الوقفة ده بياخد ثواني. الحد هنا واسع عشان
    // ماينهارش على أجهزة بطيئة، بس بيمسك لو الوقفة اتعطّلت.
    expect(ms).toBeLessThan(3000);
  });
});
