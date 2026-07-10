import { describe, it, expect } from "vitest";
import { extractNotePhrases } from "@/lib/plateParser";

describe("extractNotePhrases — قاموس عبارات الملاحظات الثابتة", () => {
  it("يمسك «الشارع بيلف يمين» كما هي", () => {
    const r = extractNotePhrases("الشارع بيلف يمين");
    expect(r.notes).toEqual(["الشارع بيلف يمين"]);
    expect(r.rest).toBe("");
  });

  it("يمسك «الشارع بيلف شمال» و«يسار»", () => {
    expect(extractNotePhrases("الشارع بيلف شمال").notes).toEqual(["الشارع بيلف شمال"]);
    expect(extractNotePhrases("الشارع بيلف يسار").notes).toEqual(["الشارع بيلف يسار"]);
  });

  it("يخمّن العبارة لو التفريغ مسمعش كويس (بلف يمن → بيلف يمين)", () => {
    const r = extractNotePhrases("الشارع بلف يمن");
    expect(r.notes).toEqual(["الشارع بيلف يمين"]);
  });

  it("يمسك جراج يمين/يسار", () => {
    expect(extractNotePhrases("جراج يمين").notes).toEqual(["جراج يمين"]);
    expect(extractNotePhrases("جراج يسار").notes).toEqual(["جراج يسار"]);
  });

  it("جراج يمين رقم ٥ → يحفظ الرقم في الملاحظة مش في اللوحة", () => {
    const r = extractNotePhrases("جراج يمين رقم ٥");
    expect(r.notes).toEqual(["جراج يمين رقم 5"]);
    expect(r.rest).toBe("");
  });

  it("كراج (تفريغ غلط لـ جراج) لسه يتعرّف", () => {
    expect(extractNotePhrases("كراج يسار").notes).toEqual(["جراج يسار"]);
  });

  it("يمسك برحة يمين/شمال وبرحة أول الشارع (مع برحه بالهاء)", () => {
    expect(extractNotePhrases("برحة يمين").notes).toEqual(["برحة يمين"]);
    expect(extractNotePhrases("برحه شمال").notes).toEqual(["برحة شمال"]);
    expect(extractNotePhrases("برحه اول الشارع").notes).toEqual(["برحة أول الشارع"]);
  });

  it("يمسك آخر الشارع يمين/يسار", () => {
    expect(extractNotePhrases("اخر الشارع يمين").notes).toEqual(["آخر الشارع يمين"]);
    expect(extractNotePhrases("آخر الشارع يسار").notes).toEqual(["آخر الشارع يسار"]);
  });

  it("يمسك حتة واسعة يمين/شمال (مع حته/واسعه)", () => {
    expect(extractNotePhrases("حتة واسعة يمين").notes).toEqual(["حتة واسعة يمين"]);
    expect(extractNotePhrases("حته واسعه شمال").notes).toEqual(["حتة واسعة شمال"]);
  });

  it("الكلام اللي مش في القاموس يفضل في rest ومش يتحط في الملاحظات", () => {
    const r = extractNotePhrases("قدام المسجد");
    expect(r.notes).toEqual([]);
    expect(r.rest).toBe("قدام المسجد");
  });

  it("يفصل عبارة الملاحظة عن اللوحة (اللوحة تفضل في rest)", () => {
    const r = extractNotePhrases("ق ن ص ١٢٣٤ جراج يمين رقم ٥");
    expect(r.notes).toEqual(["جراج يمين رقم 5"]);
    expect(r.rest.replace(/\s+/g, " ").trim()).toBe("ق ن ص 1234");
  });

  it("لا شيء = notes فاضية و rest فاضي", () => {
    const r = extractNotePhrases("");
    expect(r.notes).toEqual([]);
    expect(r.rest).toBe("");
  });
});
