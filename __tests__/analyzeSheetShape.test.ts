import { describe, it, expect } from "vitest";
import { analyzeSheetShape, analyzeSheet } from "@/lib/referralSheets";

// analyzeSheetShape = كشف صف الهيدر وعمود اللوحة **بدون** بناء كل الصفوف —
// عشان استيراد ملف داتا ضخم (مليون صف/ورقة) مايبنيش مصفوفة صفوف كاملة في
// الذاكرة (بيبنيها على دفعات في dataStore بدل كده).
describe("analyzeSheetShape — شكل الورقة بدون بناء الصفوف", () => {
  it("هيدر في أول صف", () => {
    const aoa = [
      ["م", "رقم اللوحة", "الماركة"],
      ["1", "ح ب م 2870", "رينو"],
      ["2", "ح ط س 6465", "نيسان"],
    ];
    const s = analyzeSheetShape(aoa);
    expect(s.headerRow).toBe(0);
    expect(s.plateCol).toBe(1);
    expect(s.plateColName).toBe("رقم اللوحة");
    expect(s.headers).toEqual(["م", "رقم اللوحة", "الماركة"]);
  });

  it("هيدر بعد صفوف عناوين", () => {
    const aoa = [
      ["قائمة السيارات المطلوبة", "", ""],
      ["التاريخ: 2026", "", ""],
      ["م", "رقم اللوحة", "الحي"],
      ["1", "ح ب م 2870", "النسيم"],
    ];
    const s = analyzeSheetShape(aoa);
    expect(s.headerRow).toBe(2);
    expect(s.plateColName).toBe("رقم اللوحة");
  });

  it("ورقة بلا لوحات → plateCol = -1", () => {
    const s = analyzeSheetShape([["ملخص"], ["إجمالي المطلوب"]]);
    expect(s.plateCol).toBe(-1);
  });

  it("متطابقة مع نتيجة analyzeSheet (نفس الكشف)", () => {
    const aoa = [
      ["م", "رقم اللوحة", "الماركة"],
      ["1", "ح ب م 2870", "رينو"],
      ["2", "ح ط س 6465", "نيسان"],
    ];
    const full = analyzeSheet("ورقة", aoa);
    const shape = analyzeSheetShape(aoa);
    expect(shape.headerRow).toBe(full.headerRow);
    expect(shape.plateCol).toBe(full.plateCol);
    expect(shape.plateColName).toBe(full.plateColName);
    expect(shape.headers).toEqual(full.headers);
  });
});
