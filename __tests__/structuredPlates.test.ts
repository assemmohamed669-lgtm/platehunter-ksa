import { describe, it, expect } from "vitest";
import { extractJsonObject, normalizeStructuredRows, isStrictPlate } from "@/lib/structuredPlates";

describe("isStrictPlate — بالظبط ٣ حروف صالحة + ٤ أرقام", () => {
  it("٣ حروف + ٤ أرقام صالحة", () => {
    expect(isStrictPlate("ابح1234")).toBe(true);
    expect(isStrictPlate("سصط5678")).toBe(true);
  });
  it("أرقام عربية-هندية برضه صالحة", () => {
    expect(isStrictPlate("ابح١٢٣٤")).toBe(true);
  });
  it("عدد حروف/أرقام غلط → false", () => {
    expect(isStrictPlate("اب12")).toBe(false);   // ٢ حرف + ٢ رقم
    expect(isStrictPlate("ابحد1234")).toBe(false); // ٤ حروف
    expect(isStrictPlate("ابح123")).toBe(false);   // ٣ أرقام
    expect(isStrictPlate("ابح12345")).toBe(false); // ٥ أرقام
  });
  it("حرف مش من حروف اللوحات → false", () => {
    expect(isStrictPlate("ابت1234")).toBe(false); // ت مش حرف لوحة
  });
});

describe("extractJsonObject — سحب JSON من رد الـ LLM", () => {
  it("JSON عادي", () => {
    expect(extractJsonObject('{"rows":[]}')).toEqual({ rows: [] });
  });
  it("JSON جوه code fence", () => {
    expect(extractJsonObject('```json\n{"rows":[{"plate":"ابح1234"}]}\n```')).toEqual({ rows: [{ plate: "ابح1234" }] });
  });
  it("JSON وسط كلام", () => {
    expect(extractJsonObject('هوريك النتيجة: {"rows":[]} خلاص')).toEqual({ rows: [] });
  });
  it("مفيش JSON → null", () => {
    expect(extractJsonObject("مفيش حاجة")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});

describe("normalizeStructuredRows — تطبيع وتحقّق صفوف الـ LLM", () => {
  it("بيطبّع اللوحة ويحسب needsReview لكل صف", () => {
    const rows = normalizeStructuredRows({ rows: [
      { plate: "أ ب ح 1234", vehicleType: "ملاكي", notes: "مركونة" },
      { plate: "س ص ط 5678", vehicleType: "نقل", notes: "" },
    ] });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ plate: "ابح1234", vehicleType: "ملاكي", notes: "مركونة", needsReview: false });
    expect(rows[1].plate).toBe("سصط5678");
    expect(rows[1].needsReview).toBe(false);
  });

  it("بيعلّم اللوحة المشوّهة needsReview (مش ٣ حروف + ٤ أرقام)", () => {
    const rows = normalizeStructuredRows({ rows: [{ plate: "اب12", vehicleType: "", notes: "" }] });
    expect(rows[0].needsReview).toBe(true);
  });

  it("بيسيب الصفوف اللي مفيش فيها لوحة", () => {
    const rows = normalizeStructuredRows({ rows: [
      { plate: "", vehicleType: "ملاكي", notes: "x" },
      { plate: "ابح1234" },
    ] });
    expect(rows).toHaveLength(1);
    expect(rows[0].plate).toBe("ابح1234");
  });

  it("بيقبل حقل type بدل vehicleType", () => {
    const rows = normalizeStructuredRows({ rows: [{ plate: "ابح1234", type: "خاص" }] });
    expect(rows[0].vehicleType).toBe("خاص");
  });

  it("بيقبل مصفوفة مباشرة (بدون rows)", () => {
    const rows = normalizeStructuredRows([{ plate: "ابح1234" }]);
    expect(rows).toHaveLength(1);
  });

  it("مدخل فاضي/غلط → مصفوفة فاضية", () => {
    expect(normalizeStructuredRows(null)).toEqual([]);
    expect(normalizeStructuredRows({})).toEqual([]);
  });
});
