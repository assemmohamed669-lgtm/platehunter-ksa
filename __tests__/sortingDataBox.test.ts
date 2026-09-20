import { describe, it, expect } from "vitest";
import { baseDataName, mergedDataName, sameDataFile, type SortingDataBox } from "@/lib/sortingDataBox";

describe("baseDataName", () => {
  it("بيشيل بادئة «داتا-محدّثة-» والتاريخ", () => {
    expect(baseDataName("داتا-محدّثة-2026-09-20-داتا ج.xlsx")).toBe("داتا ج.xlsx");
  });

  it("الاسم العادي بيفضل زي ما هو", () => {
    expect(baseDataName("داتا ج.xlsx")).toBe("داتا ج.xlsx");
  });

  it("بادئة متكررة (اتدمج أكتر من مرة) بتتشال كلها", () => {
    expect(baseDataName("داتا-محدّثة-داتا-محدّثة-داتا ج.xlsx")).toBe("داتا ج.xlsx");
  });

  it("بيتحمّل الهاء بدل التاء المربوطة والألف بلا شدّة", () => {
    expect(baseDataName("داتا-محدثه-داتا ج.xlsx")).toBe("داتا ج.xlsx");
  });

  it("فاضي → فاضي", () => {
    expect(baseDataName("")).toBe("");
  });
});

describe("mergedDataName", () => {
  it("بيحط البادئة مرة واحدة بس مهما اتدمج", () => {
    const once = mergedDataName("داتا ج.xlsx");
    expect(once.startsWith("داتا-محدّثة-")).toBe(true);
    expect(baseDataName(mergedDataName(once))).toBe("داتا ج.xlsx");
    expect(mergedDataName(once)).toBe(once);
  });
});

describe("sameDataFile", () => {
  const box = (fileName: string): SortingDataBox => ({ fileName, rowCount: 10 });

  it("نفس الملف بالظبط", () => {
    expect(sameDataFile(box("داتا ج.xlsx"), "داتا ج.xlsx")).toBe(true);
  });

  it("نسخة محدّثة من نفس الملف = نفس الداتا", () => {
    // بعد أول دمج الملف اللي في مربع الفرز بقى «داتا-محدّثة-…» — ولسه هو هو.
    expect(sameDataFile(box("داتا-محدّثة-2026-09-20-داتا ج.xlsx"), "داتا ج.xlsx")).toBe(true);
  });

  it("ملف تاني خالص = لأ", () => {
    expect(sameDataFile(box("داتا الرياض.xlsx"), "داتا ج.xlsx")).toBe(false);
  });

  it("مربع الفرز فاضي = لأ", () => {
    expect(sameDataFile(null, "داتا ج.xlsx")).toBe(false);
  });

  it("مابيهمّش عدد الصفوف — الدمج بيغيّره", () => {
    expect(sameDataFile({ fileName: "داتا ج.xlsx", rowCount: 999999 }, "داتا ج.xlsx")).toBe(true);
  });

  it("فروق المسافات مابتكسرش المطابقة", () => {
    expect(sameDataFile(box("  داتا ج.xlsx "), "داتا ج.xlsx")).toBe(true);
  });
});
