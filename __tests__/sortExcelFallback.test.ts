import { describe, it, expect } from "vitest";
import { buildSortBlobBestEffort } from "@/lib/excel";

const ROWS = [
  { "رقم اللوحة": "ابح1234", "نوع السيارة (المحفظة)": "كامري", "الحالة": "مطلوبة" },
  { "رقم اللوحة": "دهس5678", "نوع السيارة (المحفظة)": "النترا", "الحالة": "مطلوبة" },
];
const COLORS = [null, "#fee2e2"];

// أول بايتات ملف xlsx = توقيع zip: 0x50 0x4B ("PK"). CSV بيبدأ بـBOM (0xEF).
async function isXlsx(blob: Blob): Promise<boolean> {
  const b = new Uint8Array(await blob.arrayBuffer());
  return b[0] === 0x50 && b[1] === 0x4b;
}

describe("buildSortBlobBestEffort — التصدير يطلع Excel دايماً", () => {
  it("الوضع العادي: إكسل ملوّن (xlsx)", async () => {
    const { blob, ext } = await buildSortBlobBestEffort(ROWS, "نتائج الفرز", COLORS);
    expect(ext).toBe("xlsx");
    expect(await isXlsx(blob)).toBe(true);
  });

  it("لو الملوّن (ExcelJS) فشل → يرجع إكسل عادي (SheetJS)، مش CSV", async () => {
    const throwing = async () => { throw new Error("ExcelJS crashed on device"); };
    const { blob, ext } = await buildSortBlobBestEffort(ROWS, "نتائج الفرز", COLORS, throwing);
    expect(ext).toBe("xlsx");
    expect(await isXlsx(blob)).toBe(true);
  });

  it("لو الاتنين فشلوا → CSV آخر حل (الداتا ماتضيعش)", async () => {
    const throwColored = async () => { throw new Error("ExcelJS crashed"); };
    const throwPlain = () => { throw new Error("SheetJS null.indexOf crashed"); };
    const { blob, ext } = await buildSortBlobBestEffort(ROWS, "نتائج الفرز", COLORS, throwColored, throwPlain);
    expect(ext).toBe("csv");
    const txt = await blob.text();
    expect(txt).toContain("رقم اللوحة");
    expect(txt).toContain("ابح1234");
  });
});
