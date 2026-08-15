// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { buildBigExcelBlob } from "@/lib/excel";

/**
 * ملف الداتا الكامل (٤٨١ ألف صف) لازم ينفتح بإكسيل زي ما هو — الأدمن طلب
 * يشوف الداتا كلها، مش عيّنة.
 *
 * `buildExcelBlob` العادية بتلف على كل خلية تدوّر على الروابط — ١.٩ مليون
 * خلية بتفجّر الذاكرة (اتقاست: OOM حتى بـ 6GB). الدالة دي بتشيل اللفة دي
 * وبتكتب على طول: ٦ ثواني و٤٨٠MB على نفس الملف.
 */
describe("buildBigExcelBlob — الداتا الكاملة", () => {
  const H = ["رقم اللوحة", "نوع السيارة", "الحى"];
  const rows = [
    { "رقم اللوحة": "ا ب ج 1234", "نوع السيارة": "ونيت", "الحى": "80 الصفا" },
    { "رقم اللوحة": "د ه و 5678", "نوع السيارة": "موتوسيكل", "الحى": "81 الصفا" },
  ];

  async function parse(blob: Blob) {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
    return { sheet, wb };
  }

  it("بيكتب كل الصفوف", async () => {
    const { wb } = await parse(buildBigExcelBlob(rows, H, "داتا"));
    const out = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]]);
    expect(out).toHaveLength(2);
    expect(out[0]["رقم اللوحة"]).toBe("ا ب ج 1234");
    expect(out[1]["نوع السيارة"]).toBe("موتوسيكل");
  });

  it("بيفتح من اليمين", async () => {
    const { sheet } = await parse(buildBigExcelBlob(rows, H, "داتا"));
    expect(sheet).toMatch(/rightToLeft="1"/);
  });

  it("بيلتزم بترتيب الأعمدة المطلوب مهما كان ترتيب المفاتيح", async () => {
    const shuffled = [{ "الحى": "x", "رقم اللوحة": "p", "نوع السيارة": "t" }];
    const { wb } = await parse(buildBigExcelBlob(shuffled, H, "داتا"));
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[0]).toEqual(H);
    expect(aoa[1]).toEqual(["p", "t", "x"]);
  });

  it("صف ناقصه عمود بيسيب الخانة فاضية مش بيزحزح", async () => {
    const { wb } = await parse(buildBigExcelBlob([{ "رقم اللوحة": "p", "الحى": "x" }], H, "داتا"));
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    expect(aoa[1]).toEqual(["p", "", "x"]);
  });

  it("مافيش صفوف → ملف بالعناوين بس (مش ملف بايظ)", async () => {
    const { wb } = await parse(buildBigExcelBlob([], H, "داتا"));
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[0]).toEqual(H);
  });
});
