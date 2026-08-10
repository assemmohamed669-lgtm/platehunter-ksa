import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildColoredSortExcel, buildExcelBlob, LINK_COL_WIDTH } from "@/lib/excel";

/**
 * خانة الموقع بقت بتتكتب بالرابط كامل (عشان النسخ للواتساب يشتغل) — والرابط
 * طويل، فعمود الموقع كان بياخد أقصى عرض ويطلع الشيت وحش.
 *
 * الحل: نضيّق **عمود الروابط بس** — القيمة جوّه الخانة تفضل الرابط كامل
 * (فالنسخ زي ما هو)، بس العرض المعروض صغير.
 */

const PIN = "https://maps.app.goo.gl/TiYvx13pEkZ7sHFH6?g_st=aw";

async function sheetOf(blob: Blob) {
  // cellStyles: true ضروري عشان SheetJS تقرا عروض الأعمدة (!cols)
  const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array", cellStyles: true });
  return wb.Sheets[wb.SheetNames[0]];
}
const widthOf = (ws: XLSX.WorkSheet, i: number) => {
  const c = (ws["!cols"] ?? [])[i] as { wch?: number; width?: number } | undefined;
  return c?.wch ?? c?.width;
};

describe("عرض عمود الروابط في الشيت المشارَك", () => {
  it("عمود الموقع ضيّق مش على قد الرابط", async () => {
    const ws = await sheetOf(await buildColoredSortExcel(
      [{ "المطلوب": "ا ب ح 1234", "GPS": PIN }], "فرز", [null],
    ));
    const w = widthOf(ws, 1);
    expect(w).toBeDefined();
    expect(w!).toBeLessThanOrEqual(LINK_COL_WIDTH + 1);
  });

  it("الرابط نفسه جوّه الخانة كامل — النسخ مايتأثرش", async () => {
    const ws = await sheetOf(await buildColoredSortExcel(
      [{ "المطلوب": "ا ب ح 1234", "GPS": PIN }], "فرز", [null],
    ));
    expect(ws["B2"].v).toBe(PIN);
    expect(ws["B2"].l?.Target).toBe(PIN);
  });

  it("الأعمدة العادية عرضها لسه على قد محتواها", async () => {
    const ws = await sheetOf(await buildColoredSortExcel(
      [{ "المطلوب": "ا ب ح 1234", "العنوان": "8واحه ليلي شارع طويل جداً جداً", "GPS": PIN }], "فرز", [null],
    ));
    const addr = widthOf(ws, 1)!;
    const gps = widthOf(ws, 2)!;
    expect(addr).toBeGreaterThan(gps);
  });

  it("buildExcelBlob (السجلات/التشييك) بيضيّق عمود الروابط كمان", async () => {
    const ws = await sheetOf(buildExcelBlob([{ "رقم اللوحة": "ابح1234", "GPS": PIN }], "تشييك"));
    const w = widthOf(ws, 1);
    expect(w).toBeDefined();
    expect(w!).toBeLessThanOrEqual(LINK_COL_WIDTH + 1);
    expect(ws["B2"].v).toBe(PIN);
  });

  it("شيت من غير روابط مافيهوش أعمدة متضيّقة بالغلط", async () => {
    const ws = await sheetOf(buildExcelBlob([{ "رقم اللوحة": "ابح1234", "الحي": "الواحة" }], "تشييك"));
    expect(widthOf(ws, 1)).toBeUndefined();
  });
});
