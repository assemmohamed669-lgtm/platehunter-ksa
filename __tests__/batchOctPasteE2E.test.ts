import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { pasteColumnsOf } from "@/lib/pasteColumns";
import { buildDisplayRows } from "@/lib/exportColumns";
import { buildColoredSortExcel } from "@/lib/excel";
import { combinedDupColorMap } from "@/lib/dupColors";

/**
 * 📋 بند ٣ (المالك ١ أكتوبر ٢٠٢٦): إكسيل «لصق نصي» = كل اللي ظاهر للمندوب — الحي
 * والمسجل وكل البيانات — من نفس الطريق اللي الصفحة بتمشي فيه: أعمدة الصفوف المطابقة
 * → اللي فيه بيانات بس → صفوف المشاركة → الأعمدة النهائية → الإكسيل الملوّن.
 */
const PALETTE = ["#FEF9C3", "#DBEAFE", "#DCFCE7", "#F3E8FF", "#FFEDD5", "#FCE7F3", "#CCFBF1", "#FEE2E2"];
it("لصق نصي من داتا المجموعة ⇒ الإكسيل فيه الحي والمسجل والمكرر ملوّن", async () => {
  const row = (plate: string, street: string, hayy: string) => ({
    "رقم اللوحه ": plate, "نوع السياره": "", "اسم الشارع": street, "تاريخ التسجيل": "27/07/2026",
    "الحي": hayy, "المسجل": "سامح", "البنك": "", "رقم الهيكل": "",
  });
  const matches = [
    { converted: "ردح5349", row: row("ردح5349", "خضرا276", "الخضراء") },
    { converted: "سحه2941", row: row("سحه2941", "نسيم5", "النسيم") },
    { converted: "ردح5349", row: row("ردح5349", "خضرا280", "الخضراء") },
  ];
  // = pasteAllCols ثم pasteShownCols في الصفحة
  const all = pasteColumnsOf(matches.map((m) => m.row));
  const shown = all.filter((c) => matches.some((m) => String(m.row[c as keyof typeof m.row] ?? "").trim() !== ""));
  expect(shown).toEqual(["اسم الشارع", "تاريخ التسجيل", "الحي", "المسجل"]);   // البنك/الهيكل/النوع الفاضيين اختفوا من الشاشة
  // = buildPasteRowObject ثم pasteShareOf
  const objs = matches.map((m) => {
    const o: Record<string, unknown> = { "رقم اللوحة": m.converted };
    for (const c of shown) o[c] = m.row[c as keyof typeof m.row] ?? "";
    return o;
  });
  const { columns, rows } = buildDisplayRows(objs);
  expect(columns).toEqual(["رقم اللوحة", "نوع السيارة", "اسم الشارع", "تاريخ التسجيل", "الحي", "المسجل", "ملاحظة"]);
  const plates = matches.map((m) => m.converted);
  const map = combinedDupColorMap([plates], PALETTE.length);
  const colors = plates.map((k) => (map.has(k) ? PALETTE[map.get(k)!] : null));
  expect(colors[0]).not.toBeNull();
  expect(colors[0]).toBe(colors[2]);    // نفس اللوحة = نفس اللون
  expect(colors[1]).toBeNull();          // مش مكررة

  const blob = await buildColoredSortExcel(rows, "نتائج اللصق", colors);
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (process.env.SAVE_SAMPLE) writeFileSync(process.env.SAVE_SAMPLE, buf);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf.buffer);
  const ws = wb.getWorksheet("نتائج اللصق")!;
  expect((ws.getRow(1).values as unknown[]).filter(Boolean)).toEqual(columns);
  expect(ws.getRow(2).getCell(5).value).toBe("الخضراء");
  expect(ws.getRow(2).getCell(6).value).toBe("سامح");
  expect((ws.getRow(2).getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb)
    .toBe((ws.getRow(4).getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb);
  expect(ws.getRow(2).getCell(1).font?.bold).toBe(true);
});
