import { describe, it, expect } from "vitest";
import { buildPlateIndex, correctPlate } from "@/lib/plateCorrection";

describe("buildPlateIndex + correctPlate — تصحيح على اللوحات المعروفة", () => {
  // قاعدة معروفة صغيرة للاختبار
  const db = ["سصط7890", "ابح1234", "احي5778", "دسق9474", "رلو6161"];
  const idx = buildPlateIndex(db);

  it("لوحة موجودة بالظبط → تفضل زي ما هي (inDb، بدون تصحيح)", () => {
    const r = correctPlate("ابح1234", idx);
    expect(r).toEqual({ plate: "ابح1234", corrected: false, ambiguous: false, inDb: true });
  });

  it("حرف ناقص (صط بدل سصط) بنفس الأرقام → يثبّت على الحقيقي", () => {
    const r = correctPlate("صط7890", idx);
    expect(r.plate).toBe("سصط7890");
    expect(r.corrected).toBe(true);
    expect(r.inDb).toBe(true);
  });

  it("حرف متشابه غلط (صصط) بنفس الأرقام → يثبّت على سصط", () => {
    const r = correctPlate("صصط7890", idx);
    expect(r.plate).toBe("سصط7890");
    expect(r.corrected).toBe(true);
  });

  it("أرقام مش موجودة في الداتا → يسيبها زي ما هي (مش inDb)", () => {
    const r = correctPlate("ابح9999", idx);
    expect(r.plate).toBe("ابح9999");
    expect(r.corrected).toBe(false);
    expect(r.inDb).toBe(false);
  });

  it("أرقام عربية-هندية بتتطبّع وتتطابق", () => {
    const r = correctPlate("ابح١٢٣٤", idx);
    expect(r.plate).toBe("ابح1234");
    expect(r.inDb).toBe(true);
  });

  it("غموض: كذا لوحة حقيقية قريبة بالتساوي → مفيش تصحيح تلقائي (ambiguous)", () => {
    const idx2 = buildPlateIndex(["بحد1111", "بحر1111"]);
    const r = correctPlate("بحو1111", idx2); // على بُعد حرف من الاتنين
    expect(r.corrected).toBe(false);
    expect(r.ambiguous).toBe(true);
    expect(r.plate).toBe("بحو1111");
  });

  it("مافيش لوحة قريبة كفاية (فرق كبير) → يسيبها", () => {
    const r = correctPlate("رلو9474", idx); // أرقام 9474 موجودة (دسق) بس الحروف بعيدة
    expect(r.corrected).toBe(false);
    expect(r.inDb).toBe(true);
  });
});
