import { describe, it, expect } from "vitest";
import { clampManualPlate, manualStatus, manualHint, countPlateParts } from "@/lib/manualPlateInput";

/**
 * مربع التشييك اليدوي — المندوب بيكتب لوحة ورا لوحة بسرعة في الميدان.
 * اللوحة السعودية ٣ حروف + ٤ أرقام (سيارة) أو حرفين + ٤ أرقام (موتوسيكل).
 * الزيادة **مابتتكتبش أصلاً**، والناقصة بتطلّع رسالة حمرا.
 */

describe("قصّ اللي بيتكتب على الحد المسموح", () => {
  it("لوحة سيارة كاملة بتعدّي زي ما هي", () => {
    const r = clampManualPlate("قنص1234");
    expect(r.text).toBe("قنص1234");
    expect(r.blocked).toBe(false);
  });

  it("لوحة موتوسيكل (حرفين) بتعدّي", () => {
    expect(clampManualPlate("قن1234").text).toBe("قن1234");
  });

  it("حرف رابع مابيتكتبش", () => {
    const r = clampManualPlate("قنصر1234");
    expect(r.text).toBe("قنص1234");
    expect(r.blocked).toBe(true);
  });

  it("رقم خامس مابيتكتبش", () => {
    const r = clampManualPlate("قنص12345");
    expect(r.text).toBe("قنص1234");
    expect(r.blocked).toBe(true);
  });

  it("المسافات بتتشال (المندوب بيكتب «ق ن ص 1234»)", () => {
    expect(clampManualPlate("ق ن ص 1 2 3 4").text).toBe("قنص1234");
  });

  it("الترتيب زي ما اتكتب بالظبط", () => {
    expect(clampManualPlate("1ق2ن3ص4").text).toBe("1ق2ن3ص4");
  });

  it("الأرقام العربية بتتحسب أرقام", () => {
    const r = clampManualPlate("قنص١٢٣٤٥");
    expect(r.text).toBe("قنص١٢٣٤");
    expect(r.blocked).toBe(true);
  });

  it("مربع فاضي مايكسرش", () => {
    expect(clampManualPlate("").text).toBe("");
    expect(clampManualPlate("   ").text).toBe("");
  });
});

describe("حالة اللوحة والرسالة", () => {
  it("فاضي → مافيش رسالة", () => {
    expect(manualStatus("")).toBe("empty");
    expect(manualHint("")).toBeNull();
  });

  it("سيارة كاملة → جاهزة ومافيش رسالة", () => {
    expect(manualStatus("قنص1234")).toBe("ok");
    expect(manualHint("قنص1234")).toBeNull();
  });

  it("موتوسيكل كامل → جاهز ومافيش رسالة", () => {
    expect(manualStatus("قن1234")).toBe("ok");
    expect(manualHint("قن1234")).toBeNull();
  });

  it("ناقصة أرقام → رسالة حمرا", () => {
    expect(manualStatus("قنص123")).toBe("incomplete");
    expect(manualHint("قنص123")).toContain("تأكد من اللوحة");
  });

  it("حرف واحد بس → رسالة", () => {
    expect(manualStatus("ق1234")).toBe("incomplete");
    expect(manualHint("ق1234")).toContain("تأكد من اللوحة");
  });

  it("أرقام من غير حروف → رسالة", () => {
    expect(manualStatus("1234")).toBe("incomplete");
  });

  it("لما يتمنع حرف زيادة بتطلع رسالة الزيادة", () => {
    expect(manualHint("قنص1234", true)).toContain("زيادة");
  });

  it("العدّ صح", () => {
    expect(countPlateParts("ق ن ص 1234")).toEqual({ letters: 3, digits: 4 });
    expect(countPlateParts("")).toEqual({ letters: 0, digits: 0 });
  });
});
