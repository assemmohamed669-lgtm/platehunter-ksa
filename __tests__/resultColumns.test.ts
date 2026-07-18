import { describe, it, expect } from "vitest";
import {
  resolveResultColumns,
  looksLikeColor,
  looksLikeYear,
  looksLikeVehicleType,
} from "@/lib/resultColumns";

describe("resultColumns — كاشفات المحتوى", () => {
  it("looksLikeColor", () => {
    expect(looksLikeColor("أبيض")).toBe(true);
    expect(looksLikeColor("فضي")).toBe(true);
    expect(looksLikeColor("White")).toBe(true);
    expect(looksLikeColor("تويوتا")).toBe(false);
    expect(looksLikeColor("2020")).toBe(false);
  });
  it("looksLikeYear", () => {
    expect(looksLikeYear("2020")).toBe(true);
    expect(looksLikeYear("٢٠١٥")).toBe(true);
    expect(looksLikeYear("1995")).toBe(true);
    expect(looksLikeYear("1234")).toBe(false); // لوحة مش سنة
    expect(looksLikeYear("أبيض")).toBe(false);
  });
  it("looksLikeVehicleType", () => {
    expect(looksLikeVehicleType("ونيت")).toBe(true);
    expect(looksLikeVehicleType("صالون")).toBe(true);
    expect(looksLikeVehicleType("تويوتا")).toBe(false);
  });
});

describe("resultColumns — تحليل بالاسم", () => {
  it("أعمدة بأسماء معروفة تتحلّل بالترتيب الثابت", () => {
    const headers = ["رقم اللوحة", "صانع المركبة", "النوع", "الحي", "GPS", "اللون", "سنة الصنع", "تاريخ التسجيل"];
    const rows = [{ "رقم اللوحة": "دحر1234", "صانع المركبة": "تويوتا", "النوع": "صالون", "الحي": "العليا", "GPS": "x", "اللون": "أبيض", "سنة الصنع": "2020", "تاريخ التسجيل": "15/05/2024" }];
    const res = resolveResultColumns(headers, rows, "رقم اللوحة");
    // الترتيب الثابت: نوع، ماركة، عنوان، GPS، لون، سنة، تاريخ
    expect(res.map((c) => c.key)).toEqual(["type", "brand", "address", "gps", "color", "year", "date"]);
    expect(res.find((c) => c.key === "brand")?.sourceCol).toBe("صانع المركبة");
    expect(res.find((c) => c.key === "type")?.sourceCol).toBe("النوع");
    expect(res.find((c) => c.key === "year")?.sourceCol).toBe("سنة الصنع");
  });
});

describe("resultColumns — تحليل بالمحتوى (أسماء مختلفة/غايبة)", () => {
  it("أعمدة بأسماء مبهمة تتحلّل بمحتواها", () => {
    // أسماء غير معروفة تماماً → لازم يتحدد بالقيم
    const headers = ["عمود A", "عمود B", "عمود C", "عمود D"];
    const rows = [
      { "عمود A": "نيسان", "عمود B": "أسود", "عمود C": "2019", "عمود D": "01/02/2023" },
      { "عمود A": "هيونداي", "عمود B": "فضي", "عمود C": "2021", "عمود D": "03/04/2023" },
      { "عمود A": "كيا", "عمود B": "أبيض", "عمود C": "2018", "عمود D": "05/06/2023" },
    ];
    const res = resolveResultColumns(headers, rows, null);
    const byKey = Object.fromEntries(res.map((c) => [c.key, c.sourceCol]));
    expect(byKey["brand"]).toBe("عمود A");
    expect(byKey["color"]).toBe("عمود B");
    expect(byKey["year"]).toBe("عمود C");
    expect(byKey["date"]).toBe("عمود D");
    // الترتيب الثابت محفوظ (brand قبل color قبل year قبل date)
    expect(res.map((c) => c.key)).toEqual(["brand", "color", "year", "date"]);
  });

  it("عمود «موديل» بأسماء موديلات مايتحسبش «سنة الصنع» (مراجعة عدائية)", () => {
    // ماركة منفصلة + عمود «موديل» قيمه أسماء موديلات → «موديل» ماينفعش year
    const headers = ["رقم اللوحة", "الماركة", "موديل"];
    const rows = [
      { "رقم اللوحة": "دحر1234", "الماركة": "تويوتا", "موديل": "كامري" },
      { "رقم اللوحة": "دحر5678", "الماركة": "نيسان", "موديل": "صني" },
      { "رقم اللوحة": "دحر9012", "الماركة": "هيونداي", "موديل": "النترا" },
    ];
    const res = resolveResultColumns(headers, rows, "رقم اللوحة");
    expect(res.find((c) => c.key === "brand")?.sourceCol).toBe("الماركة");
    expect(res.find((c) => c.key === "year")).toBeUndefined(); // «موديل» مااتحسبش سنة
  });

  it("عمود «موديل» بأرقام سنين يتحسب «سنة الصنع» (بالمحتوى)", () => {
    const headers = ["رقم اللوحة", "موديل"];
    const rows = [
      { "رقم اللوحة": "دحر1234", "موديل": "2020" },
      { "رقم اللوحة": "دحر5678", "موديل": "2019" },
      { "رقم اللوحة": "دحر9012", "موديل": "2021" },
    ];
    const res = resolveResultColumns(headers, rows, "رقم اللوحة");
    expect(res.find((c) => c.key === "year")?.sourceCol).toBe("موديل");
  });

  it("مايكررش عمود مصدر لهدفين", () => {
    const headers = ["A", "B"];
    const rows = [{ A: "أبيض", B: "2020" }, { A: "أسود", B: "2019" }, { A: "فضي", B: "2021" }];
    const res = resolveResultColumns(headers, rows, null);
    const srcs = res.map((c) => c.sourceCol);
    expect(new Set(srcs).size).toBe(srcs.length); // مفيش تكرار
  });
});
