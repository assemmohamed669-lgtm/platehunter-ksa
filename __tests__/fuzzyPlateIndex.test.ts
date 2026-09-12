import { describe, it, expect } from "vitest";
import { FuzzyPlateIndex } from "@/lib/fuzzyPlateIndex";

/**
 * الفرز كان تطابق تام بس — لوحة اتكتبت غلط بحرف أو رقم واحد بتفوت خالص.
 */
describe("فهرس اللوحات المتشابهة", () => {
  const idx = new FuzzyPlateIndex<string>();
  for (const p of ["رنع3110", "ابح1234", "سحد6547", "ريي7889"]) idx.add(p, p);

  it("حرف غلط — نفس الأرقام", () => {
    expect(idx.find("رمع3110")?.norm).toBe("رنع3110");
  });

  it("رقم غلط — نفس الحروف", () => {
    expect(idx.find("رنع3118")?.norm).toBe("رنع3110");
  });

  it("التطابق التام بيرجع ١٠٠٪", () => {
    expect(idx.find("ابح1234")).toEqual({ norm: "ابح1234", value: "ابح1234", similarity: 100 });
  });

  it("لوحة بعيدة مابترجعش", () => {
    expect(idx.find("قلم9999")).toBeNull();
  });

  it("خانتين غلط مابترجعش (خانة واحدة بس)", () => {
    expect(idx.find("رمع3111")).toBeNull();
  });

  it("طول مختلف مابيتحسبش متشابه", () => {
    expect(idx.find("رنع311")).toBeNull();
  });

  it("مابيفهرسش اللي مش لوحة (حروف بس أو أرقام بس)", () => {
    const i2 = new FuzzyPlateIndex<string>();
    i2.add("رقم", "x"); i2.add("1234", "y");
    expect(i2.size).toBe(0);
  });

  it("findAll بترجّع كل الصفوف المتشابهة", () => {
    const i3 = new FuzzyPlateIndex<number>();
    i3.add("رنع3110", 1); i3.add("رنع3110", 2); i3.add("رمع3110", 3);
    expect(i3.findAll("رنع3110").length).toBe(3);
  });
});
