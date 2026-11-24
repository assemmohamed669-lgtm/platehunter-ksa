// @vitest-environment node
/**
 * 📤 شيت صفحة السجلات (مشاركة / فتح الشيت / تصدير) — المالك (٢٤ نوفمبر ٢٠٢٦): «اتأكد ان الشيت اللي بيتشارك مرتب والخط فيه
 * بولد وظاهر والشيت بيفتح والاعمدة بتظهر من اليمين لليسار».
 *
 * كان `buildExcelBlob` (SheetJS): من اليمين لليسار بس — من غير بولد ولا حدود ولا عرض أعمدة. دلوقتي نفس شيت نتيجة الفرز
 * (`buildSortBlobBestEffort` ⇐ `buildColoredSortExcel`): بولد ١٣ (العناوين ١٤ بخلفية)، حدود، العناوين ثابتة فوق، عرض على قد
 * الكلام، محاذاة يمين — ولو الموبايل ماقدرش ⇒ إكسيل عادي ⇒ CSV (الداتا ماتضيعش).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildSortBlobBestEffort } from "@/lib/excel";

const rows = [
  { "رقم اللوحة": "رلع7528", "النوع": "ملاكي", "ملاحظات": "قدام البيت", "اسم الحي": "النسيم", "اسم الشارع": "الأمير سلطان", "الحالة": "متشيكة بالصوت", "GPS": "https://maps.google.com/?q=24.7,46.7", "التاريخ": "24-11-2026 10:00" },
  { "رقم اللوحة": "دمس5284", "النوع": "", "ملاحظات": "", "اسم الحي": "الروابي", "اسم الشارع": "", "الحالة": "متشيكة بالصوت", "GPS": "", "التاريخ": "24-11-2026 10:01" },
];

describe("شيت السجلات — مرتب وبولد ومن اليمين لليسار وبيفتح", () => {
  it("الملف بيتفتح وفيه العناوين والصفوف بالترتيب", async () => {
    const { blob, ext } = await buildSortBlobBestEffort(rows, "التشييك الميداني", rows.map(() => null));
    expect(ext).toBe("xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
    const ws = wb.getWorksheet("التشييك الميداني")!;
    expect(ws).toBeTruthy();
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(Object.keys(rows[0]));
    expect(ws.getRow(2).getCell(5).value).toBe("الأمير سلطان");
    expect(ws.rowCount).toBe(3);

    // من اليمين لليسار + العناوين ثابتة فوق
    expect(ws.views[0]).toMatchObject({ rightToLeft: true, state: "frozen", ySplit: 1 });
    // بولد: العناوين ١٤ والصفوف ١٣
    expect(ws.getRow(1).getCell(1).font).toMatchObject({ bold: true, size: 14 });
    expect(ws.getRow(2).getCell(1).font).toMatchObject({ bold: true, size: 13 });
    // حتى الخانة الفاضية بولد وبحدود (الصف موحّد)
    expect(ws.getRow(3).getCell(2).font).toMatchObject({ bold: true });
    expect(ws.getRow(3).getCell(2).border?.top?.style).toBe("thin");
    // مرتب: كل عمود عرضه على قد الكلام (مش العرض الافتراضي الضيق) — والمحاذاة يمين
    for (let c = 1; c <= 8; c++) expect(ws.getColumn(c).width ?? 0).toBeGreaterThanOrEqual(12);
    expect(ws.getRow(2).getCell(5).alignment).toMatchObject({ horizontal: "right", readingOrder: "rtl" });
    // GPS لينك بيتداس
    expect((ws.getRow(2).getCell(7).value as { hyperlink?: string }).hyperlink).toMatch(/^https:\/\/(www\.)?google\.com\/maps\?q=24\.7,46\.7/);
  });
});

describe("صفحة السجلات بتستخدم الشيت المنسّق في التلاتة", () => {
  const P = readFileSync(path.join(process.cwd(), "app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("مشاركة · فتح الشيت · تصدير ⇐ buildFieldSheet (buildSortBlobBestEffort)", () => {
    expect(P).toMatch(/async function buildFieldSheet\(rows: Record<string, unknown>\[\]\): Promise<\{ blob: Blob; ext: "xlsx" \| "csv" \}> \{\s*return buildSortBlobBestEffort\(rows, "التشييك الميداني", rows\.map\(\(\) => null\)\);/);
    expect(P).toMatch(/const \{ blob, ext \} = await buildFieldSheet\(shareNoLocation \? withoutLocation\(buildFieldRows\(\)\) : buildFieldRows\(\)\);\s*await shareExcelBlob\(blob, `التشييك-الميداني\.\$\{ext\}`, "التشييك الميداني"\);/);
    expect(P).toMatch(/build=\{async \(\) => \{ const \{ blob, ext \} = await buildFieldSheet\(buildFieldRows\(\)\); return \{ blob, name: `التشييك-الميداني-\$\{Date\.now\(\)\}\.\$\{ext\}` \}; \}\}/);
    expect(P).not.toMatch(/buildExcelBlob\(buildFieldRows\(\)/);
  });
});
