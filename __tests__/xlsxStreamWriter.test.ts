import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { buildXlsxStream, xlsxStreamSupported } from "@/lib/xlsxStreamWriter";
import { streamXlsxToBatches } from "@/lib/xlsxStream";

/**
 * 📗 xlsx «حتة حتة» — المالك (١٨ أكتوبر ٢٠٢٦): «خليها يبقي فيها الاخيارين انه يختار يصدر الملف باي صيغه» + «لو تقدر
 * تخليه يبقي اسرع». ملف الـ٤٨٠ ألف صف كان بيطلع CSV بس، لأن الإكسيل العادي بيتبني كله في الذاكرة (الموبايل يقفل).
 * هنا الملف بيتكتب ويتضغط دفعة دفعة، وكل الخانات «نص» (فـ«0055» والأرقام الطويلة ماتتلخبطش).
 */
const H = ["رقم اللوحة", "النوع", "رقم العقد", "ملاحظات"];

async function* batchesOf(rows: Record<string, string>[], size: number) {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

const tricky: Record<string, string>[] = [
  { "رقم اللوحة": "رقه9312", "النوع": "كامري", "رقم العقد": "0055", "ملاحظات": "اتسحبت & <مهم> \"x\" 'y'" },
  { "رقم اللوحة": "سبص5725", "النوع": "", "رقم العقد": "16000548547908123456", "ملاحظات": "سطر\nتاني 🚗" },
  { "رقم اللوحة": "حيا4086", "النوع": "اكسنت", "رقم العقد": "1e5", "ملاحظات": "حرف تحكم\u0001هنا" },
];

describe("🔴 الملف بيتقري سليم", () => {
  it("المتصفّح/نود فيه أداة الضغط", () => {
    expect(xlsxStreamSupported()).toBe(true);
  });

  it("بالإكسيل (SheetJS): نفس العناوين والقيم بالظبط — نص زي ما هو", async () => {
    const blob = await buildXlsxStream({ headers: H, batches: batchesOf(tricky, 2) });
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });
    expect(aoa[0]).toEqual(H);
    expect(aoa[1]).toEqual(["رقه9312", "كامري", "0055", "اتسحبت & <مهم> \"x\" 'y'"]);
    expect(aoa[2]).toEqual(["سبص5725", "", "16000548547908123456", "سطر\nتاني 🚗"]);
    expect(aoa[3]).toEqual(["حيا4086", "اكسنت", "1e5", "حرف تحكمهنا"]);
    // كل الخانات نص (مش رقم)
    expect(ws["C2"].t).toBe("s");
  });

  it("🔴 بقارئ البرنامج نفسه (لو المندوب رفعه تاني في الداتا)", async () => {
    const blob = await buildXlsxStream({ headers: H, batches: batchesOf(tricky, 1) });
    const got: Record<string, string>[] = [];
    await streamXlsxToBatches(blob, (rows) => { got.push(...rows); });
    expect(got.length).toBe(3);
    expect(got[0]["رقم العقد"]).toBe("0055");
    expect(got[1]["رقم العقد"]).toBe("16000548547908123456");
    expect(got[0]["ملاحظات"]).toBe("اتسحبت & <مهم> \"x\" 'y'");
    expect(got[2]["رقم اللوحة"]).toBe("حيا4086");
  });

  it("من اليمين + محاذاة يمين جوّه الملف نفسه (من غير ما يتفتح تاني في الذاكرة)", async () => {
    const blob = await buildXlsxStream({ headers: H, batches: batchesOf(tricky, 3) });
    // checkCRC32 ⇒ الإكسيل نفسه بيرفض الملف لو التأكيد غلط
    const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
    expect(await zip.file("xl/worksheets/sheet1.xml")!.async("string")).toMatch(/rightToLeft="1"/);
    expect(await zip.file("xl/styles.xml")!.async("string")).toMatch(/horizontal="right"/);
  });

  it("بيقول وصل لكام صف (لمؤشر التقدّم)", async () => {
    const rows = Array.from({ length: 12_000 }, (_, i) => ({ "رقم اللوحة": `رقه${1000 + (i % 9000)}`, "النوع": "كامري", "رقم العقد": String(i), "ملاحظات": "" }));
    const seen: number[] = [];
    const blob = await buildXlsxStream({ headers: H, batches: batchesOf(rows, 5000), onRows: (n) => seen.push(n) });
    expect(seen).toEqual([5000, 10_000, 12_000]);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]).length).toBe(12_000);
  });
});

describe("🔴 تأكيد الـZIP (CRC) سليم — الإكسيل بيرفض الملف لو غلط", () => {
  it("ملف كبير بدفعات كتير", async () => {
    const rows = Array.from({ length: 30_000 }, (_, i) => ({ "رقم اللوحة": `سبص${1000 + (i % 9000)}`, "النوع": "هايلكس", "رقم العقد": String(i * 7919), "ملاحظات": i % 7 ? "" : "ملاحظة & <x>" }));
    const blob = await buildXlsxStream({ headers: H, batches: batchesOf(rows, 4096) });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(xml.endsWith("</sheetData></worksheet>")).toBe(true);
    for (const n of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml"]) {
      expect(await zip.file(n)!.async("string")).toMatch(/^<\?xml/);
    }
  });
});

describe("🔴 حروف بايظة في الشيت مابتبوّظش الملف", () => {
  it("حرف تحكم / نص مكسور (surrogate لوحده) بيتشال، والإيموجي بيفضل", async () => {
    const rows = [{ "رقم اللوحة": "رقه9312", "النوع": "a\uD800b", "رقم العقد": "\u0007x\u000Bz", "ملاحظات": "🚗👍" }];
    const blob = await buildXlsxStream({ headers: H, batches: batchesOf(rows, 1) });
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
    expect(aoa[1]).toEqual(["رقه9312", "ab", "xz", "🚗👍"]);
  });
});
