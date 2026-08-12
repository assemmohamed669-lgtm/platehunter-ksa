import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { buildExcelBlob, buildSpreadsheetBlob, buildColoredSortExcel } from "@/lib/excel";
import { rtlAlignBlob } from "@/lib/rtlExcel";

/**
 * اختبار من الآخر للآخر: الشيت اللي البرنامج بيبنيه فعلاً (فرز / مطلوب /
 * سجلات / تشييك / شاص) لازم يفتح **من اليمين** وكل خلاياه محاذاة يمين — بعد ما
 * يعدّي على نفس المسار اللي بيمشي فيه وقت المشاركة (`rtlAlignBlob` جوه
 * openExcelBlob / shareExcelBlob).
 *
 * الاختبار ده بيمسك ارتداد حقيقي حصل قبل كده: `ws["!views"] = [{ RTL: true }]`
 * كانت شكلها صح في الكود لكن SheetJS بتتجاهلها في الكتابة، فالشيتات كانت بتفتح
 * من الشمال عند المناديب من غير ما حد ياخد باله.
 */

const ROWS = [
  { "رقم اللوحة": "ابح1234", "نوع السيارة": "صالون", "الحي": "الواحة", "سنة الصنع": 2019 },
  { "رقم اللوحة": "دنر5678", "نوع السيارة": "H1", "الحي": "السامر", "سنة الصنع": 2022 },
];

async function inspect(blob: Blob) {
  const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
  const sheet = await zip.file(/^xl\/worksheets\/sheet\d+\.xml$/)[0].async("string");
  const stylesFile = zip.file("xl/styles.xml");
  const styles = stylesFile ? await stylesFile.async("string") : "";
  return { sheet, styles };
}

/** كل نمط خلية فيه محاذاة يمين؟ */
function everyStyleIsRight(styles: string): boolean {
  const block = styles.match(/<cellXfs[^>]*>[\s\S]*?<\/cellXfs>/);
  if (!block) return false;
  const xfs = (block[0].match(/<xf[\s>]/g) ?? []).length;
  const right = (block[0].match(/<alignment [^>]*horizontal="right"/g) ?? []).length;
  return xfs > 0 && right === xfs;
}

describe("الشيتات اللي البرنامج بيشاركها — من اليمين ومحاذاة يمين", () => {
  it("buildExcelBlob (السجلات/التشييك/الشاص) بيفتح من اليمين", async () => {
    const { sheet } = await inspect(buildExcelBlob(ROWS, "التشييك الميداني"));
    expect(sheet).toMatch(/rightToLeft="1"/);
  });

  it("وبعد مسار المشاركة كل الخلايا محاذاة يمين", async () => {
    const out = await rtlAlignBlob(buildExcelBlob(ROWS, "التشييك الميداني"), "تشييك.xlsx");
    const { sheet, styles } = await inspect(out);
    expect(sheet).toMatch(/rightToLeft="1"/);
    expect(everyStyleIsRight(styles)).toBe(true);
    expect(styles).toMatch(/readingOrder="2"/);
  });

  it("buildSpreadsheetBlob (المطلوب/اللصق/ملف التشييك) نفس الحكاية", async () => {
    const { blob, ext } = buildSpreadsheetBlob(ROWS, "لوحات مطلوبة");
    expect(ext).toBe("xlsx");
    const { sheet, styles } = await inspect(await rtlAlignBlob(blob, "مطلوب.xlsx"));
    expect(sheet).toMatch(/rightToLeft="1"/);
    expect(everyStyleIsRight(styles)).toBe(true);
  });

  it("buildColoredSortExcel (نتيجة الفرز) بتفضل من اليمين وألوانها ما بتضيعش", { timeout: 30_000 }, async () => {
    const colors = ["#FFE0E0", null];
    const blob = await buildColoredSortExcel(ROWS, "نتائج الفرز", colors);
    const before = await inspect(blob);
    const fillsBefore = (before.styles.match(/<fill>/g) ?? []).length;

    const out = await rtlAlignBlob(blob, "فرز.xlsx");
    const after = await inspect(out);
    expect(after.sheet).toMatch(/rightToLeft="1"/);
    expect(everyStyleIsRight(after.styles)).toBe(true);
    // الألوان زي ما هي — التعديل بيزوّد محاذاة مش بيستبدل الأنماط
    expect((after.styles.match(/<fill>/g) ?? []).length).toBe(fillsBefore);
    expect(after.styles).toMatch(/FFFFE0E0/i);
  });

  it("البيانات نفسها ماتغيّرتش بعد التعديل", async () => {
    const out = await rtlAlignBlob(buildExcelBlob(ROWS, "التشييك"), "x.xlsx");
    const wb = XLSX.read(new Uint8Array(await out.arrayBuffer()), { type: "array" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])).toEqual(ROWS);
  });

  it("الروابط (خرائط GPS) بتفضل شغّالة بعد التعديل", async () => {
    const withGps = [{ "رقم اللوحة": "ابح1234", "GPS": "https://maps.google.com/?q=21.5,39.2" }];
    const out = await rtlAlignBlob(buildExcelBlob(withGps, "التشييك"), "x.xlsx");
    const wb = XLSX.read(new Uint8Array(await out.arrayBuffer()), { type: "array", cellStyles: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws["B2"].l?.Target).toContain("google.com/maps");
    expect(ws["B2"].l?.Target).toContain("21.5,39.2");
    // نص الخانة = الرابط نفسه — عشان النسخ للواتساب يوصل رابط شغّال
    expect(String(ws["B2"].v)).toContain("21.5,39.2");
  });

  it("CSV (الحل البديل لما xlsx يفشل على الموبايل) بيعدّي زي ما هو", async () => {
    const csv = new Blob(["﻿رقم اللوحة,الحي\r\nابح1234,الواحة"], { type: "text/csv;charset=utf-8" });
    expect(await rtlAlignBlob(csv, "نتيجة.csv")).toBe(csv);
  });
});
