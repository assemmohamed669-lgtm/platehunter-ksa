import { describe, it, expect } from "vitest";
import { resolveCheckColumns, inferVehicleType, findHeader } from "@/lib/wantedColumns";

describe("resolveCheckColumns", () => {
  it("عمود «النوع» فيه موديل → يتحسب ماركة، ونوع السيارة يفضل فاضي", () => {
    const { brandCol, typeCol } = resolveCheckColumns(["رقم اللوحة", "النوع", "البنك"]);
    expect(brandCol).toBe("النوع");
    expect(typeCol).toBeNull();
  });

  it("عمود «طراز المركبة» = الماركة", () => {
    const { brandCol, typeCol } = resolveCheckColumns(["رقم اللوحة", "طراز المركبة"]);
    expect(brandCol).toBe("طراز المركبة");
    expect(typeCol).toBeNull();
  });

  it("عمود ماركة حقيقي له الأولوية على «النوع»", () => {
    const { brandCol, typeCol } = resolveCheckColumns(["اللوحة", "الماركة", "النوع"]);
    expect(brandCol).toBe("الماركة");
    // «النوع» عمود مستقل عن الماركة → يبقى نوع السيارة.
    expect(typeCol).toBe("النوع");
  });

  it("ماركة + نوع منفصلين → كل واحد لخانته", () => {
    const { brandCol, typeCol } = resolveCheckColumns(["الماركة", "نوع السيارة"]);
    expect(brandCol).toBe("الماركة");
    expect(typeCol).toBe("نوع السيارة");
  });

  it("يلقط عمود البنك بأسماء مختلفة", () => {
    expect(resolveCheckColumns(["اللوحة", "البنك"]).bankCol).toBe("البنك");
    expect(resolveCheckColumns(["Plate", "Agency"]).bankCol).toBe("Agency");
    expect(resolveCheckColumns(["اللوحة", "جهة التمويل"]).bankCol).toBe("جهة التمويل");
    expect(resolveCheckColumns(["اللوحة", "نوع البنك"]).bankCol).toBe("نوع البنك");
  });

  it("«الشركة المصنعة» = ماركة مش بنك (مايتعدّش عمود ماركة كبنك)", () => {
    const { brandCol, bankCol } = resolveCheckColumns(["اللوحة", "الشركة المصنعة"]);
    expect(brandCol).toBe("الشركة المصنعة");
    expect(bankCol).toBeNull();
  });

  it("مفيش أعمدة → كله null", () => {
    const { brandCol, typeCol, bankCol } = resolveCheckColumns(["رقم اللوحة", "الحي"]);
    expect(brandCol).toBeNull();
    expect(typeCol).toBeNull();
    expect(bankCol).toBeNull();
  });
});

describe("inferVehicleType", () => {
  it("ونيت", () => expect(inferVehicleType("هايلوكس ونيت")).toBe("ونيت"));
  it("فان", () => expect(inferVehicleType("هيونداي H1 فان")).toBe("فان"));
  it("دباب", () => expect(inferVehicleType("دباب سوزوكي")).toBe("دباب"));
  it("نقل/شاحنة", () => expect(inferVehicleType("شاحنة نقل")).toBe("نقل"));
  it("باص من كلمة روزا", () => expect(inferVehicleType("نص روزا")).toBe("باص"));
  it("أجرة", () => expect(inferVehicleType("النترا اجرة")).toBe("أجرة"));

  it("موديل عادي → فاضي", () => {
    expect(inferVehicleType("بيكانتو")).toBe("");
    expect(inferVehicleType("Suburban")).toBe("");
    expect(inferVehicleType("سيراتيو")).toBe("");
  });

  it("مايتلخبطش «فانتج» بـ«فان»", () => expect(inferVehicleType("فانتج")).toBe(""));
  it("نص فاضي", () => expect(inferVehicleType("")).toBe(""));
});

describe("findHeader", () => {
  it("بيطابق جزء من اسم العمود", () => {
    expect(findHeader(["رقم اللوحة", "لون المركبة"], ["لون"])).toBe("لون المركبة");
  });
  it("case-insensitive للإنجليزي", () => {
    expect(findHeader(["Plate", "AGENCY"], ["agency"])).toBe("AGENCY");
  });
  it("مفيش تطابق → null", () => {
    expect(findHeader(["اللوحة"], ["بنك"])).toBeNull();
  });
});
