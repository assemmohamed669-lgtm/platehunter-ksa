import { describe, it, expect } from "vitest";
import { isHiddenTashyeekCol } from "@/lib/resultColumns";

/**
 * نافذة نتيجة **السجلات** (سيارات شيت التشييك اللي طلعت مطلوبة) كانت بتلحق آخرها
 * أعمدة مالهاش لازمة من شيت التشييك: الملاحظات، البنك، الشاص، الهيكل، وأعمدة
 * «اللوحة» المكررة. المندوب مش عايزهم.
 *
 * الأهم: **«رقم اللوحة» الأساسي لازم يفضل** — هو أول عمود في النتيجة.
 */

describe("isHiddenTashyeekCol — الأعمدة اللي بتتخفي من نتيجة السجلات", () => {
  it("بتخفي الأعمدة اللي المندوب مش عايزها", () => {
    for (const h of ["الملاحظات", "ملاحظات", "البنك", "بنك التمويل", "الشاص", "رقم الشاص", "الهيكل", "رقم الهيكل", "Chassis Number"]) {
      expect(isHiddenTashyeekCol(h)).toBe(true);
    }
  });

  it("بتخفي أعمدة اللوحة المكررة اللي في آخر الشيت", () => {
    for (const h of ["اللوحة", "اللوحه", "لوحة", "لوحه", "اللوحة_1", "اللوحه_2", "Plate", "PLATE_1"]) {
      expect(isHiddenTashyeekCol(h)).toBe(true);
    }
  });

  it("«رقم اللوحة» الأساسي مابيتخفيش أبداً", () => {
    for (const h of ["رقم اللوحة", "رقم اللوحه", "Plate Number", "PLATE_NO", "رقم اللوحة عربي"]) {
      expect(isHiddenTashyeekCol(h)).toBe(false);
    }
  });

  it("الأعمدة المفيدة بتفضل ظاهرة", () => {
    for (const h of ["نوع السيارة", "الحي", "العنوان", "الماركة", "اللون", "سنة الصنع", "GPS", "تاريخ التسجيل", "الحالة", "اسم الموقع"]) {
      expect(isHiddenTashyeekCol(h)).toBe(false);
    }
  });

  it("المسافات الزيادة مابتخربطش القاعدة", () => {
    expect(isHiddenTashyeekCol("  اللوحه  ")).toBe(true);
    expect(isHiddenTashyeekCol("  رقم اللوحة  ")).toBe(false);
  });

  it("قيمة فاضية أو غير نص مابتكسرش", () => {
    expect(isHiddenTashyeekCol("")).toBe(false);
    expect(isHiddenTashyeekCol(undefined as unknown as string)).toBe(false);
  });
});
