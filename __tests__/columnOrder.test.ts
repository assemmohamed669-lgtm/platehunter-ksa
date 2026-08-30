import { describe, it, expect } from "vitest";
import { orderedLabels, optionalAvailable, toggleColumn, FIXED_LEADING_LABELS } from "@/lib/columnOrder";

const AVAIL = ["نوع السيارة", "الماركة", "ملاحظة", "العنوان", "الحي", "GPS", "اللون", "سنة الصنع"];

describe("columnOrder", () => {
  it("مفيش اختيار → الثابت بس (نوع السيارة ثم الماركة)", () => {
    expect(orderedLabels(AVAIL, [])).toEqual(["نوع السيارة", "الماركة"]);
  });

  it("الاختيار بيظهر بترتيبه بعد الثابت", () => {
    expect(orderedLabels(AVAIL, ["اللون", "الحي", "GPS"])).toEqual(
      ["نوع السيارة", "الماركة", "اللون", "الحي", "GPS"],
    );
  });

  it("الثابت مايتكررش لو المندوب اختاره", () => {
    expect(orderedLabels(AVAIL, ["الماركة", "اللون"])).toEqual(["نوع السيارة", "الماركة", "اللون"]);
  });

  it("بيتجاهل أعمدة مش متاحة في الملف ده", () => {
    expect(orderedLabels(AVAIL, ["اسم المسجل", "اللون"])).toEqual(["نوع السيارة", "الماركة", "اللون"]);
  });

  it("لو الثابت مش موجود في الملف مايظهرش", () => {
    expect(orderedLabels(["الماركة", "اللون"], ["اللون"])).toEqual(["الماركة", "اللون"]);
  });

  it("optionalAvailable = المتاح ناقص الثابت ورقم اللوحة", () => {
    expect(optionalAvailable(["رقم اللوحة", ...AVAIL])).toEqual(
      ["ملاحظة", "العنوان", "الحي", "GPS", "اللون", "سنة الصنع"],
    );
  });

  it("toggleColumn: يضيف آخر القائمة ويشيل", () => {
    expect(toggleColumn([], "اللون")).toEqual(["اللون"]);
    expect(toggleColumn(["اللون"], "الحي")).toEqual(["اللون", "الحي"]);
    expect(toggleColumn(["اللون", "الحي"], "اللون")).toEqual(["الحي"]);
  });

  it("الثابتين متعرّفين صح", () => {
    expect(FIXED_LEADING_LABELS).toEqual(["نوع السيارة", "الماركة"]);
  });
});
