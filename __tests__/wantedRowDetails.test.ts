import { describe, it, expect } from "vitest";
import { wantedExtraValues, wantedExtraColumns } from "@/lib/wantedRowDetails";

describe("wantedExtraValues — صف السجل + صف المحفظة في صف واحد", () => {
  const record = { "النوع": "ونيت", "الشارع": "سعد 43", "الحي": "غربي جديد", "الموقع": "77" };
  const wallet = { "رقم اللوحة": "أبج1234", "طراز المركبة": "Staria", "لون المركبة": "Grey", "سنة الصنع": "2023" };

  it("بيجمع الاتنين", () => {
    const out = wantedExtraValues(record, wallet);
    expect(out["الموقع"]).toBe("77");
    expect(out["طراز المركبة"]).toBe("Staria");
    expect(out["سنة الصنع"]).toBe("2023");
  });

  it("بيشتغل من غير محفظة (لوحة مالهاش صف مطابق)", () => {
    const out = wantedExtraValues(record, undefined);
    expect(out["الحي"]).toBe("غربي جديد");
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });

  it("🔴 صف السجل بيكسب لو نفس اسم العمود موجود في الاتنين", () => {
    // بيانات المندوب من الميدان أحدث من المحفظة.
    const out = wantedExtraValues({ "الحي": "اللي المندوب شافه" }, { "الحي": "اللي في المحفظة" });
    expect(out["الحي"]).toBe("اللي المندوب شافه");
  });

  it("بيشيل الخانات الفاضية عشان ماتزحمش الجدول", () => {
    const out = wantedExtraValues({ "النوع": "", "الحي": "  ", "الموقع": "9" }, undefined);
    expect(out).not.toHaveProperty("النوع");
    expect(out).not.toHaveProperty("الحي");
    expect(out["الموقع"]).toBe("9");
  });

  it("🔴 مابيكرّرش الأعمدة اللي الجدول بيعرضها أصلاً", () => {
    // «رقم اللوحة» و«التاريخ» ليهم أعمدة ثابتة — تكرارهم بيضيّع مساحة الشاشة.
    const out = wantedExtraValues({ "رقم اللوحة": "أبج1234", "التاريخ": "2026-09-24", "الموقع": "77" }, undefined);
    expect(out).not.toHaveProperty("رقم اللوحة");
    expect(out).not.toHaveProperty("التاريخ");
    expect(out["الموقع"]).toBe("77");
  });
});

describe("wantedExtraColumns — ترتيب الأعمدة", () => {
  it("بيجمع كل الأعمدة من كل الصفوف بلا تكرار", () => {
    const cols = wantedExtraColumns([{ "أ": "1", "ب": "2" }, { "ب": "3", "ج": "4" }]);
    expect(cols).toEqual(["أ", "ب", "ج"]);
  });

  it("بيرجّع فاضي لو مافيش صفوف", () => {
    expect(wantedExtraColumns([])).toEqual([]);
  });

  it("الترتيب ثابت — أول ظهور بيحدّد المكان", () => {
    const a = wantedExtraColumns([{ "ج": "1" }, { "أ": "2" }]);
    expect(a).toEqual(["ج", "أ"]);
  });
});
